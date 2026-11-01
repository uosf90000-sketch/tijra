import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth";
import { hasBusinessWideRead } from "@/lib/business-wide-access";
import { locationAuthorized } from "@/lib/location-access";
import { db } from "@/lib/db";
import { adjustLocationStock, consumeLots, receiveLot, syncListingForProduct } from "@/lib/commerce-ops";
import { productionUnitCost } from "@/lib/manufacturing-math";

const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("COMPLETE")}).strict(),
  z.object({action:z.literal("CANCEL"),reason:z.string().trim().min(8).max(500)}).strict(),
]);

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  const c=await getSessionContext();
  if(!c)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
  if(!["OWNER","MANAGER"].includes(c.membership.role))
    return NextResponse.json({error:"FORBIDDEN"},{status:403});
  if(!(await hasBusinessWideRead(c)))
    return NextResponse.json({error:"BRANCH_SCOPED_REPORT_UNAVAILABLE"},{status:403});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"INVALID_MANUFACTURING_ACTION",details:parsed.error.flatten()},{status:400});
  const {id}=await params,businessId=c.business.id;
  try{
    const result=await db.$transaction(async tx=>{
      const rows=await tx.$queryRaw<Array<{id:string}>>`
        SELECT "id" FROM "ManufacturingOrder"
        WHERE "id" = ${id} AND "businessId" = ${businessId}
        FOR UPDATE
      `;
      if(!rows.length)throw new Error("MANUFACTURING_ORDER_NOT_FOUND");
      const order=await tx.manufacturingOrder.findFirst({
        where:{id,businessId},
        include:{materials:true},
      });
      if(!order)throw new Error("MANUFACTURING_ORDER_NOT_FOUND");
      if(order.status!=="PLANNED")throw new Error("MANUFACTURING_ORDER_ALREADY_CLOSED");
      if(!(await locationAuthorized(c,order.locationId)))throw new Error("LOCATION_ACCESS_DENIED");
      if(parsed.data.action==="CANCEL"){
        const changed=await tx.manufacturingOrder.updateMany({
          where:{id,businessId,status:"PLANNED"},
          data:{status:"CANCELLED",completedByUserId:c.user.id},
        });
        if(changed.count!==1)throw new Error("MANUFACTURING_CONCURRENT_CHANGE");
        await tx.inventoryAuditEvent.create({data:{
          businessId,action:"MANUFACTURING_ORDER_CANCELLED",orderId:id,
          actorUserId:c.user.id,actorName:c.user.name,actorRole:c.membership.role,
          note:JSON.stringify({reason:parsed.data.reason,stockAffected:false}),
        }});
        return {id,status:"CANCELLED",stockAffected:false};
      }
      if(!order.materials.length)throw new Error("MANUFACTURING_NO_MATERIALS");
      const productIds=[order.outputProductId,...order.materials.map(x=>x.productId)];
      const products=await tx.product.findMany({
        where:{businessId,id:{in:productIds},active:true},
      });
      if(products.length!==productIds.length)throw new Error("MANUFACTURING_PRODUCT_NOT_FOUND");
      const productById=new Map(products.map(x=>[x.id,x]));
      const materialCosts:Array<{quantity:number;unitCost:number}>=[];
      for(const material of order.materials){
        const p=productById.get(material.productId);
        if(!p)throw new Error("MANUFACTURING_PRODUCT_NOT_FOUND");
        const needed=Number(material.quantity);
        if(needed<=0 || !Number.isFinite(needed))throw new Error("MANUFACTURING_INVALID_MATERIAL");
        const available=await tx.product.updateMany({
          where:{id:p.id,businessId,quantity:{gte:needed},active:true},
          data:{quantity:{decrement:needed}},
        });
        if(available.count!==1)throw new Error("MANUFACTURING_INSUFFICIENT_MATERIAL:"+p.name);
        await adjustLocationStock(tx,{
          businessId,locationId:order.locationId,productId:p.id,productName:p.name,delta:-needed,
        });
        await consumeLots(tx,{businessId,productId:p.id,quantity:needed,locationId:order.locationId});
        await syncListingForProduct(tx,{businessId,productId:p.id,delta:-needed});
        await tx.manufacturingOrderMaterial.update({
          where:{id:material.id},data:{unitCost:p.averageCost},
        });
        await tx.stockMovement.create({data:{
          businessId,productId:p.id,type:"ADJUSTMENT_OUT",quantity:-needed,
          unitCost:p.averageCost,sourceType:"ManufacturingOrder",sourceId:id,
          note:"استهلاك مادة أولية في أمر إنتاج "+id,
        }});
        materialCosts.push({quantity:needed,unitCost:Number(p.averageCost)});
      }
      const output=productById.get(order.outputProductId);
      if(!output)throw new Error("MANUFACTURING_OUTPUT_MISSING");
      const produced=Number(order.quantity);
      const costing=productionUnitCost(materialCosts,produced);
      const oldQty=Number(output.quantity),oldCost=Number(output.averageCost);
      const newAverage=Math.round(((oldQty*oldCost+costing.totalCost)/(oldQty+produced))*100)/100;
      const increased=await tx.product.updateMany({
        where:{id:output.id,businessId,active:true},
        data:{quantity:{increment:produced},averageCost:newAverage},
      });
      if(increased.count!==1)throw new Error("MANUFACTURING_OUTPUT_MISSING");
      await adjustLocationStock(tx,{
        businessId,locationId:order.locationId,
        productId:output.id,productName:output.name,delta:produced,
      });
      await receiveLot(tx,{
        businessId,productId:output.id,productName:output.name,
        quantity:produced,unitCost:costing.unitCost,
        lotNumber:order.lotNumber,locationId:order.locationId,
        actor:{userId:c.user.id,name:c.user.name,role:c.membership.role},
      });
      await syncListingForProduct(tx,{businessId,productId:output.id,delta:produced});
      await tx.stockMovement.create({data:{
        businessId,productId:output.id,type:"ADJUSTMENT_IN",
        quantity:produced,unitCost:costing.unitCost,
        sourceType:"ManufacturingOrder",sourceId:id,
        note:"إنتاج نهائي من أمر "+id,
      }});
      const changed=await tx.manufacturingOrder.updateMany({
        where:{id,businessId,status:"PLANNED"},
        data:{status:"COMPLETED",materialCost:costing.totalCost,
          completedAt:new Date(),completedByUserId:c.user.id},
      });
      if(changed.count!==1)throw new Error("MANUFACTURING_CONCURRENT_CHANGE");
      await tx.inventoryAuditEvent.create({data:{
        businessId,action:"MANUFACTURING_ORDER_COMPLETED",orderId:id,
        listingId:output.id,itemName:output.name,quantity:produced,
        actorUserId:c.user.id,actorName:c.user.name,actorRole:c.membership.role,
        note:JSON.stringify({locationId:order.locationId,lotNumber:order.lotNumber,
          materialCost:costing.totalCost,unitCost:costing.unitCost,
          materials:order.materials.map(m=>({id:m.productId,quantity:Number(m.quantity)})),
          accountingJournalPosted:false,qualityInspectionCertified:false}),
      }});
      return {id,status:"COMPLETED",stockAffected:true,
        produced,materialCost:costing.totalCost,unitCost:costing.unitCost};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:15000});
    return NextResponse.json({order:result,accountingJournalPosted:false});
  }catch(e){
    const code=e instanceof Error?e.message:"MANUFACTURING_ACTION_FAILED";
    if(code==="MANUFACTURING_ORDER_NOT_FOUND"||code==="MANUFACTURING_PRODUCT_NOT_FOUND")
      return NextResponse.json({error:code},{status:404});
    if(code==="LOCATION_ACCESS_DENIED")
      return NextResponse.json({error:code},{status:403});
    if(code.startsWith("MANUFACTURING_") || code.startsWith("INSUFFICIENT_LOCATION_STOCK") ||
      code.startsWith("PRODUCTION_") || e instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002","P2034"].includes(e.code))
      return NextResponse.json({error:code},{status:409});
    console.error("Manufacturing completion failed",e);
    return NextResponse.json({error:"MANUFACTURING_ACTION_FAILED"},{status:500});
  }
}
