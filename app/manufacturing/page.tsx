import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { hasBusinessWideRead } from "@/lib/business-wide-access";
import { db } from "@/lib/db";
import { listInventoryLocations } from "@/lib/commerce-ops";
import { PageHeader } from "@/components/page-header";
import { ManufacturingWorkspace } from "@/components/manufacturing-workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "التصنيع وأوامر الإنتاج | مدار" };

export default async function ManufacturingPage(){
  const c=await getSessionContext();
  if(!c)redirect("/login");
  const role=c.membership.role;
  if(!["OWNER","MANAGER","ACCOUNTANT"].includes(role))redirect("/no-access");
  if(!(await hasBusinessWideRead(c)))redirect("/no-access");
  const businessId=c.business.id;
  const [products,boms,orders,locations]=await Promise.all([
    db.product.findMany({where:{businessId,active:true},select:{
      id:true,name:true,unit:true,quantity:true,averageCost:true,
    },orderBy:{name:"asc"},take:500}),
    db.manufacturingBom.findMany({where:{businessId,active:true},
      include:{outputProduct:{select:{name:true,unit:true}},
        components:{include:{product:{select:{id:true,name:true,unit:true}}}}},
      orderBy:{createdAt:"desc"},take:120}),
    db.manufacturingOrder.findMany({where:{businessId},
      include:{bom:{select:{name:true}},outputProduct:{select:{name:true,unit:true}},
        materials:{include:{product:{select:{name:true,unit:true}}}}},
      orderBy:{createdAt:"desc"},take:150}),
    listInventoryLocations(businessId),
  ]);
  return <>
    <PageHeader eyebrow="مدار / إدارة الإنتاج" title="التصنيع وأوامر الإنتاج"
      description="خط إنتاج أساسي: قائمة مكونات لكل دفعة، تخطيط أمر، ثم استهلاك المواد وإضافة الناتج بعد الاعتماد." />
    <ManufacturingWorkspace
      products={products.map(p=>({
        id:p.id,name:p.name,unit:p.unit,quantity:Number(p.quantity),cost:Number(p.averageCost),
      }))}
      boms={boms.map(b=>({
        id:b.id,name:b.name,output:b.outputProduct.name,
        outputQty:Number(b.outputQty),
        components:b.components.map(x=>({
          productId:x.productId,name:x.product.name,quantity:Number(x.quantity),
          unit:x.product.unit,
        })),
      }))}
      orders={orders.map(o=>({
        id:o.id,output:o.outputProduct.name,bom:o.bom.name,status:o.status,
        quantity:Number(o.quantity),unit:o.outputProduct.unit,
        materialCost:o.materialCost?.toFixed(2)||null,
        createdAt:o.createdAt.toISOString(),
        materials:o.materials.map(m=>({name:m.product.name,quantity:Number(m.quantity)})),
      }))}
      locations={locations.filter(l=>l.active).map(l=>({id:l.id,name:l.name}))}
      canManage={role==="OWNER"||role==="MANAGER"}
      currency={c.business.currency}
    />
  </>;
}
