import { redirect } from "next/navigation";
import { Barcode, Boxes, Package } from "lucide-react";
import { UnitConversionForm } from "@/components/commerce-forms";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { listUnitConversions } from "@/lib/commerce-ops";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";

export const metadata = { title: "وحدات البيع والتحويل" };
export const dynamic = "force-dynamic";

export default async function UnitsPage() {
  const context = await getSessionContext(); if (!context) redirect("/login");
  const [products, conversions] = await Promise.all([
    db.product.findMany({ where: { businessId: context.business.id, active: true }, select: { id: true, name: true, barcode: true, unit: true, quantity: true }, orderBy: { name: "asc" }, take: 1000 }),
    listUnitConversions(context.business.id),
  ]);
  const nameMap = new Map(products.map((x) => [x.id, x.name]));
  return <>
    <PageHeader eyebrow="المخزون والكاشير" title="وحدات البيع والتحويل" description="خلّ المخزون بوحدة أساسية واحدة، وبع بالحبة أو الباك أو الكرتون أو الوزن. مثال: كرتون = 24 حبة فيخصم 24 تلقائيًا." />
    <section className="metricsGrid three"><MetricCard label="الأصناف" value={`${products.length}`} note="بوحداتها الأساسية" icon={Boxes} /><MetricCard label="وحدات إضافية" value={`${conversions.length}`} note="كرتون / باك / غيره" icon={Package} tone="blue" /><MetricCard label="وحدات بباركود" value={`${conversions.filter((x) => x.barcode).length}`} note="يمكن مسحها مباشرة" icon={Barcode} tone="violet" /></section>
    <UnitConversionForm products={products.map((x) => ({ id: x.id, name: x.name, barcode: x.barcode, unit: x.unit, quantity: Number(x.quantity) }))} />
    <section className="panel tablePanel"><div className="panelHeader tableHeader"><div><span className="eyebrow">الوحدات المحفوظة</span><h2>معاملات التحويل</h2></div></div><div className="tableScroll"><table className="dataTable"><thead><tr><th>الصنف</th><th>الوحدة</th><th>تساوي من الأساس</th><th>السعر</th><th>الباركود</th></tr></thead><tbody>{conversions.map((x) => <tr key={x.id}><td><strong>{nameMap.get(x.productId) || "صنف"}</strong></td><td>{x.name}</td><td>{x.factor.toLocaleString("ar-SA")}</td><td>{x.salePrice == null ? "سعر الصنف الأساسي" : formatSar(x.salePrice)}</td><td>{x.barcode || "—"}</td></tr>)}{!conversions.length && <tr><td colSpan={5}><div className="infoNote">أضف مثلًا «كرتون = 24 حبة» ليظهر مباشرة في الكاشير.</div></td></tr>}</tbody></table></div></section>
  </>;
}
