import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth";
import { hasBusinessWideRead } from "@/lib/business-wide-access";
import { db } from "@/lib/db";
import { milli } from "@/lib/manufacturing-math";

const q=z.number().finite().positive().max(100000000).refine(v=>{
  try { milli(v); return true; } catch { return false; }
},"THREE_DECIMAL_QUANTITY_REQUIRED");
const schema=z.object({
  name:z.string().trim().min(3).max(160),
  outputProductId:z.string().min(1),
  outputQty:q,
  components:z.array(z.object({
    productId:z.string().min(1),quantity:q,
  }).strict()).min(1).max(80),
}).strict().refine(x=>
  !x.components.some(c=>c.productId===x.outputProductId) &&
  new Set(x.components.map(c=>c.productId)).size===x.components.length,
  {message:"DUPLICATE_OR_SELF_COMPONENT"});

export async function GET(){
  const c=await getSessionContext();
  if(!c)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
  if(!["OWNER","MANAGER","ACCOUNTANT"].includes(c.membership.role))
    return NextResponse.json({error:"FORBIDDEN"},{status:403});
  if(!(await hasBusinessWideRead(c)))
    return NextResponse.json({error:"BRANCH_SCOPED_REPORT_UNAVAILABLE"},{status:403});
  const boms=await db.manufacturingBom.findMany({
    where:{businessId:c.business.id,active:true},
    include:{outputProduct:{select:{id:true,name:true}},
      components:{include:{product:{select:{id:true,name:true,unit:true}}}}},
    orderBy:{createdAt:"desc"},take:120,
  });
  return NextResponse.json({boms,limit:120,versionedEditingSupported:false});
}

export async function POST(request:Request){
  const c=await getSessionContext();
  if(!c)return NextResponse.json({error:"UNAUTHORIZED"},{status:401});
  if(!["OWNER","MANAGER"].includes(c.membership.role))
    return NextResponse.json({error:"FORBIDDEN"},{status:403});
  if(!(await hasBusinessWideRead(c)))
    return NextResponse.json({error:"BRANCH_SCOPED_REPORT_UNAVAILABLE"},{status:403});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"INVALID_BOM",details:parsed.error.flatten()},{status:400});
  const x=parsed.data,businessId=c.business.id;
  try{
    const bom=await db.$transaction(async tx=>{
      const productIds=[x.outputProductId,...x.components.map(x=>x.productId)];
      const products=await tx.product.findMany({
        where:{businessId,active:true,id:{in:productIds}},select:{id:true},
      });
      if(products.length!==productIds.length)throw new Error("PRODUCT_NOT_FOUND_OR_OTHER_COMPANY");
      const bom=await tx.manufacturingBom.create({
        data:{businessId,outputProductId:x.outputProductId,name:x.name,
          outputQty:x.outputQty,createdByUserId:c.user.id,
          components:{create:x.components.map(item=>({productId:item.productId,quantity:item.quantity}))}},
        include:{components:true},
      });
      await tx.inventoryAuditEvent.create({data:{
        businessId,action:"MANUFACTURING_BOM_CREATED",orderId:bom.id,itemName:bom.name,
        actorUserId:c.user.id,actorName:c.user.name,actorRole:c.membership.role,
        note:JSON.stringify({outputProductId:bom.outputProductId,outputQty:x.outputQty,
          componentIds:x.components.map(item=>item.productId),versionEditing:false}),
      }});
      return bom;
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    return NextResponse.json({bom},{status:201});
  }catch(e){
    const code=e instanceof Error?e.message:"BOM_CREATE_FAILED";
    if(code==="PRODUCT_NOT_FOUND_OR_OTHER_COMPANY")return NextResponse.json({error:code},{status:404});
    if(e instanceof Prisma.PrismaClientKnownRequestError&&["P2002","P2034"].includes(e.code))
      return NextResponse.json({error:"DUPLICATE_OR_CONCURRENT_BOM"},{status:409});
    console.error("Manufacturing BOM create failed",e);
    return NextResponse.json({error:"BOM_CREATE_FAILED"},{status:500});
  }
}
