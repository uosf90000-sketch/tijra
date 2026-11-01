import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth";
import { hasBusinessWideRead } from "@/lib/business-wide-access";
import { db } from "@/lib/db";
import { ensureDefaultLocation, listInventoryLocations } from "@/lib/commerce-ops";
import { locationAuthorized } from "@/lib/location-access";
import { milli, requiredMaterial } from "@/lib/manufacturing-math";

const q=z.number().positive().max(100000000).refine(x=>{
  try { milli(x); return true; }catch{return false;}
},"THREE_DECIMAL_QUANTITY_REQUIRED");
const schema=z.object({
  bomId:z.string().min(1),quantity:q,
  locationId:z.string().min(1).optional(),
  lotNumber:z.string().trim().min(1).max(100).optional(),
  clientRequestId:z.string().uuid().optional(),
}).strict();

export async function GET(){
  const c=await getSessionContext();
  if(!c)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
  if(!["OWNER","MANAGER","ACCOUNTANT"].includes(c.membership.role))
    return NextResponse.json({error:"FORBIDDEN"},{status:403});
  if(!(await hasBusinessWideRead(c)))
    return NextResponse.json({error:"BRANCH_SCOPED_REPORT_UNAVAILABLE"},{status:403});
  const orders=await db.manufacturingOrder.findMany({
    where:{businessId:c.business.id},
    include:{bom:{select:{name:true}},outputProduct:{select:{name:true,unit:true}},
      materials:{include:{product:{select:{name:true,unit:true}}}}},
    orderBy:{createdAt:"desc"},take:150,
  });
  return NextResponse.json({orders,limit:150,financialPosting:false});
}

export async function POST(request:Request){
  const c=await getSessionContext();
  if(!c)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
  if(!["OWNER","MANAGER"].includes(c.membership.role))
    return NextResponse.json({error:"FORBIDDEN"},{status:403});
  if(!(await hasBusinessWideRead(c)))
    return NextResponse.json({error:"BRANCH_SCOPED_REPORT_UNAVAILABLE"},{status:403});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"INVALID_ORDER",details:parsed.error.flatten()},{status:400});
  const x=parsed.data,businessId=c.business.id;
  const defaultLocation=await ensureDefaultLocation(businessId);
  const locationId=x.locationId||defaultLocation.id;
  const locations=await listInventoryLocations(businessId);
  if(!locations.some(l=>l.id===locationId && l.active))
    return NextResponse.json({error:"LOCATION_NOT_FOUND"},{status:404});
  if(!(await locationAuthorized(c,locationId)))
    return NextResponse.json({error:"LOCATION_ACCESS_DENIED"},{status:403});
  const fingerprint=x.clientRequestId?createHash("sha256")
    .update(JSON.stringify([x.bomId,x.quantity,x.locationId||null,x.lotNumber||null]))
    .digest("hex"):null;
  try{
    const result=await db.$transaction(async tx=>{
      if(x.clientRequestId){
        const existing=await tx.manufacturingOrder.findUnique({
          where:{businessId_requestKey:{businessId,requestKey:x.clientRequestId}},
        });
        if(existing){
          if(existing.requestHash!==fingerprint)throw new Error("MANUFACTURING_REQUEST_KEY_REUSED");
          return {order:existing,duplicate:true};
        }
      }
      const bom=await tx.manufacturingBom.findFirst({
        where:{businessId,id:x.bomId,active:true},
        include:{components:true},
      });
      if(!bom||!bom.components.length)throw new Error("BOM_NOT_FOUND");
      const productIds=[bom.outputProductId,...bom.components.map(line=>line.productId)];
      const products=await tx.product.findMany({
        where:{businessId,id:{in:productIds},active:true},select:{id:true},
      });
      if(products.length!==productIds.length)throw new Error("BOM_PRODUCT_INACTIVE");
      const materials=bom.components.map(line=>({
        productId:line.productId,
        quantity:requiredMaterial(Number(line.quantity),Number(bom.outputQty),x.quantity),
      }));
      const order=await tx.manufacturingOrder.create({
        data:{
          businessId,bomId:bom.id,outputProductId:bom.outputProductId,
          locationId,quantity:x.quantity,lotNumber:x.lotNumber||null,
          requestKey:x.clientRequestId||null,requestHash:fingerprint,
          createdByUserId:c.user.id,
          materials:{create:materials},
        },
        include:{materials:true},
      });
      await tx.inventoryAuditEvent.create({data:{
        businessId,action:"MANUFACTURING_ORDER_PLANNED",orderId:order.id,
        actorUserId:c.user.id,actorName:c.user.name,actorRole:c.membership.role,
        note:JSON.stringify({bomId:bom.id,outputProductId:bom.outputProductId,
          locationId,quantity:x.quantity,materials,stockAffected:false}),
      }});
      return {order,duplicate:false};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    return NextResponse.json({...result,financialPosting:false},{status:result.duplicate?200:201});
  }catch(e){
    const code=e instanceof Error?e.message:"MANUFACTURING_ORDER_FAILED";
    if(["BOM_NOT_FOUND","BOM_PRODUCT_INACTIVE"].includes(code))
      return NextResponse.json({error:code},{status:404});
    if(code==="MANUFACTURING_REQUEST_KEY_REUSED")
      return NextResponse.json({error:code},{status:409});
    if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==="P2002"&&x.clientRequestId){
      const existing=await db.manufacturingOrder.findUnique({
        where:{businessId_requestKey:{businessId,requestKey:x.clientRequestId}},
      });
      if(existing && existing.requestHash===fingerprint)
        return NextResponse.json({order:existing,duplicate:true,financialPosting:false});
      return NextResponse.json({error:"MANUFACTURING_REQUEST_KEY_REUSED"},{status:409});
    }
    if(code.startsWith("BOM_") || e instanceof Prisma.PrismaClientKnownRequestError && e.code==="P2034")
      return NextResponse.json({error:code},{status:409});
    console.error("Manufacturing order failed",e);
    return NextResponse.json({error:"MANUFACTURING_ORDER_FAILED"},{status:500});
  }
}
