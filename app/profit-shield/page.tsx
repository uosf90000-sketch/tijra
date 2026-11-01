import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { hasBusinessWideRead } from "@/lib/business-wide-access";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { summarizeProfitShield } from "@/lib/profit-shield";
export const dynamic = "force-dynamic";
export const metadata = { title: "درع الأرباح | مدار" };
export default async function ProfitShieldPage() {
  const c=await getSessionContext();
  if(!c) redirect("/login");
  if(!(await hasBusinessWideRead(c)) || !["OWNER","MANAGER","ACCOUNTANT"].includes(c.membership.role)) redirect("/no-access");
  const since=new Date(Date.now()-30*86400000), businessId=c.business.id;
  const [sales,waste,saleCount,wasteCount,expenses,fees]=await Promise.all([
    db.saleItem.findMany({where:{sale:{businessId,soldAt:{gte:since}}},include:{product:{select:{name:true}}},
      orderBy:{sale:{soldAt:"desc"}},take:5000}),
    db.stockMovement.findMany({where:{businessId,sourceType:"WASTE",occurredAt:{gte:since}},
      select:{productId:true,quantity:true,unitCost:true},orderBy:{occurredAt:"desc"},take:2000}),
    db.saleItem.count({where:{sale:{businessId,soldAt:{gte:since}}}}),
    db.stockMovement.count({where:{businessId,sourceType:"WASTE",occurredAt:{gte:since}}}),
    db.expense.aggregate({where:{businessId,expenseDate:{gte:since}},_sum:{amount:true}}),
    db.paymentSettlement.aggregate({where:{businessId,salesDate:{gte:since}},_sum:{fees:true}}),
  ]);
  const data=summarizeProfitShield(
    sales.map(x=>({id:x.productId,name:x.product.name,qty:Number(x.quantity),
      price:Number(x.unitPrice),cost:Number(x.unitCost)})),
    waste.map(x=>({id:x.productId,qty:Math.abs(Number(x.quantity)),unitCost:Number(x.unitCost||0)})),
  );
  const currency=c.business.currency, fmt=(v:number)=>v.toFixed(2)+" "+currency;
  return <>
    <PageHeader eyebrow="مدار 360" title="درع الأرباح"
      description="آخر 30 يومًا: ربح إجمالي مبني على تكلفة أسطر البيع الفعلية، مع أثر الهدر المسجل."
      actions={<Link href="/products/pricing" className="button secondary">مراجعة الأسعار</Link>}/>
    {(sales.length<saleCount||waste.length<wasteCount)&&<div className="infoNote">
      التحليل جزئي: عُرضت {sales.length} من {saleCount} أسطر بيع و{waste.length} من {wasteCount} حركات هدر. لا تعتمد المجاميع لاتخاذ قرار مالي نهائي.
    </div>}
    <section className="metricsGrid four">
      <article className="panel"><span className="eyebrow">الإيراد المسجل</span><h2>{fmt(data.total.revenue)}</h2></article>
      <article className="panel"><span className="eyebrow">تكلفة البيع</span><h2>{fmt(data.total.cost)}</h2></article>
      <article className="panel"><span className="eyebrow">الربح الإجمالي</span><h2>{fmt(data.total.gross)}</h2></article>
      <article className="panel"><span className="eyebrow">الربح بعد هدر المنتجات المباعة</span><h2>{fmt(data.total.afterWaste)}</h2></article>
    </section>
    <div className="infoNote">الرسوم المسجلة إجمالًا {fmt(Number(fees._sum.fees||0))} والمصروفات {fmt(Number(expenses._sum.amount||0))}، لا تُوزع على المنتجات. الهدر المرتبط بمواد خام لا تُباع مستقلة غير محسوب داخل هامش المنتج النهائي. الأرقام ليست صافي ربح أو إقرارًا ضريبيًا.</div>
    <section className="panel tablePanel"><div className="panelHeader"><div><span className="eyebrow">حسب الصنف</span><h2>مخاطر الهامش</h2></div></div>
      <div className="tableScroll"><table className="dataTable">
        <thead><tr><th>المنتج</th><th>الكمية</th><th>الإيراد</th><th>تكلفة البيع</th><th>الهامش</th><th>الهدر</th><th>بعد الهدر</th></tr></thead>
        <tbody>{data.products.map(x=><tr key={x.id}>
          <td><strong>{x.name}</strong></td><td>{x.qty.toFixed(3)}</td><td>{fmt(x.revenue)}</td>
          <td>{fmt(x.cost)}</td><td className={x.margin!==null&&x.margin<15?"dangerText":""}>{x.margin===null?"—":x.margin+"%"}</td>
          <td>{fmt(x.waste)}</td><td>{fmt(x.afterWaste)}</td>
        </tr>)}
        {!data.products.length&&<tr><td colSpan={7}>لا توجد مبيعات في الفترة.</td></tr>}</tbody>
      </table></div>
    </section>
    <p className="policyNote">لا تغيّر هذه الشاشة سعر البيع، ولا تثبت أن التحصيل تم بنكيًا، ولا تحتسب ضريبة القيمة المضافة أو جميع المصروفات التشغيلية.</p>
  </>;
}
