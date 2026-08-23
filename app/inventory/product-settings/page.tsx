import { redirect } from "next/navigation";
import { Boxes, ChefHat, Scale, ScanLine } from "lucide-react";
import { ProductConfigForm } from "@/components/commerce-forms";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { safeJson } from "@/lib/commerce-ops";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "إعدادات البيع حسب النشاط" };
export const dynamic = "force-dynamic";

const modeLabels: Record<string, string> = { STANDARD: "قطعة / كمية", WEIGHT: "وزن وكسور", SERIAL: "Serial / IMEI", RECIPE: "وصفة / وجبة", SERVICE: "خدمة" };

export default async function ProductSettingsPage() {
  const context = await getSessionContext(); if (!context) redirect("/login");
  const [products, configs] = await Promise.all([
    db.product.findMany({ where: { businessId: context.business.id, active: true }, select: { id: true, name: true, barcode: true, unit: true, quantity: true }, orderBy: { name: "asc" }, take: 1500 }),
    db.inventoryAuditEvent.findMany({ where: { businessId: context.business.id, action: "PRODUCT_CONFIG" }, orderBy: { occurredAt: "desc" } }),
  ]);
  const productMap = new Map(products.map((x) => [x.id, x]));
  const parsed = configs.map((row) => ({ row, config: safeJson<{ saleMode?: string; size?: string | null; color?: string | null; variantGroup?: string | null }>(row.note, {}) }));
  const serialCount = parsed.filter((x) => x.config.saleMode === "SERIAL").length;
  const weightCount = parsed.filter((x) => x.config.saleMode === "WEIGHT").length;
  const recipeCount = parsed.filter((x) => x.config.saleMode === "RECIPE").length;
  return <>
    <PageHeader eyebrow="الكاشير" title="إعدادات البيع حسب النشاط" description="نفس كاشير تِجرا يتكيّف مع نشاطك: وزن للخضار، وصفات للمطاعم، Serial/IMEI للإلكترونيات، متغيرات للملابس، وخدمات بدون مخزون." />
    <section className="metricsGrid three"><MetricCard label="بالوزن" value={`${weightCount}`} note="تقبل كسور مثل 1.5 كجم" icon={Scale} /><MetricCard label="Serial / IMEI" value={`${serialCount}`} note="قطعة مرتبطة برقم فريد" icon={ScanLine} tone="blue" /><MetricCard label="وصفات" value={`${recipeCount}`} note="تخصم المكونات" icon={ChefHat} tone="violet" /></section>
    <ProductConfigForm products={products.map((x) => ({ id: x.id, name: x.name, barcode: x.barcode, unit: x.unit, quantity: Number(x.quantity) }))} businessActivity={context.business.businessActivity} />
    <section className="panel tablePanel"><div className="panelHeader tableHeader"><div><span className="eyebrow">الإعدادات المحفوظة</span><h2>طريقة بيع الأصناف</h2></div><Boxes size={20} /></div><div className="tableScroll"><table className="dataTable"><thead><tr><th>الصنف</th><th>طريقة البيع</th><th>المقاس</th><th>اللون</th><th>مجموعة المتغيرات</th></tr></thead><tbody>{parsed.map(({ row, config }) => <tr key={row.id}><td><strong>{row.listingId ? productMap.get(row.listingId)?.name || row.itemName : row.itemName}</strong></td><td>{modeLabels[config.saleMode || "STANDARD"] || config.saleMode}</td><td>{config.size || "—"}</td><td>{config.color || "—"}</td><td>{config.variantGroup || "—"}</td></tr>)}{!parsed.length && <tr><td colSpan={5}><div className="infoNote">الأصناف العادية تعمل مباشرة. خصص فقط الأصناف التي تحتاج وزن، Serial، وصفة أو خدمة.</div></td></tr>}</tbody></table></div></section>
  </>;
}
