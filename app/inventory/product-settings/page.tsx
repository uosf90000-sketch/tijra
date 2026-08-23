import { redirect } from "next/navigation";
import { Boxes, ChefHat, Scale, ScanLine } from "lucide-react";
import { ActivityProductConfigForm } from "@/components/activity-product-config-form";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { firstPermissionHref } from "@/lib/access";
import { getSessionContext } from "@/lib/auth";
import { isFoodActivity } from "@/lib/business-experience";
import { safeJson } from "@/lib/commerce-ops";
import { db } from "@/lib/db";

export const metadata = { title: "إعدادات البيع حسب النشاط" };
export const dynamic = "force-dynamic";

const modeLabels: Record<string, string> = { STANDARD: "قطعة / كمية", WEIGHT: "وزن وكسور", SERIAL: "Serial / IMEI", RECIPE: "منتج بمكونات", SERVICE: "خدمة" };

export default async function ProductSettingsPage() {
  const context = await getSessionContext(); if (!context) redirect("/login");
  if (context.membership.role !== "OWNER") redirect(firstPermissionHref(context.membership));
  const foodBusiness = isFoodActivity(context.business.businessActivity);
  const [products, configs] = await Promise.all([
    db.product.findMany({ where: { businessId: context.business.id, active: true }, select: { id: true, name: true, barcode: true, unit: true, quantity: true }, orderBy: { name: "asc" }, take: 1500 }),
    db.inventoryAuditEvent.findMany({ where: { businessId: context.business.id, action: "PRODUCT_CONFIG" }, orderBy: { occurredAt: "desc" } }),
  ]);
  const productMap = new Map(products.map((x) => [x.id, x]));
  const parsed = configs.map((row) => ({ row, config: safeJson<{ saleMode?: string; size?: string | null; color?: string | null; variantGroup?: string | null }>(row.note, {}) }));
  const serialCount = parsed.filter((x) => x.config.saleMode === "SERIAL").length;
  const weightCount = parsed.filter((x) => x.config.saleMode === "WEIGHT").length;
  const recipeCount = parsed.filter((x) => x.config.saleMode === "RECIPE").length;
  const serviceCount = parsed.filter((x) => x.config.saleMode === "SERVICE").length;
  return <>
    <PageHeader eyebrow="الكاشير" title="إعدادات البيع حسب النشاط" description={foodBusiness ? "منتجات المطعم والمقهى تستخدم الصور والمكونات، ويمكن تخصيص الوزن أو الخدمات عند الحاجة." : "خصص فقط المنتجات التي تحتاج وزنًا أو Serial/IMEI أو خدمة. الوصفات لا تظهر إلا للمطاعم والمقاهي."} />
    <section className="metricsGrid three">
      <MetricCard label="بالوزن" value={`${weightCount}`} note="تقبل كسور مثل 1.5 كجم" icon={Scale} />
      <MetricCard label="Serial / IMEI" value={`${serialCount}`} note="قطعة مرتبطة برقم فريد" icon={ScanLine} tone="blue" />
      {foodBusiness ? <MetricCard label="بمكونات" value={`${recipeCount}`} note="تخصم المكونات تلقائيًا" icon={ChefHat} tone="violet" /> : <MetricCard label="خدمات" value={`${serviceCount}`} note="بيع بدون خصم مخزون" icon={Boxes} tone="violet" />}
    </section>
    <ActivityProductConfigForm products={products.map((x) => ({ id: x.id, name: x.name, barcode: x.barcode, unit: x.unit, quantity: Number(x.quantity) }))} businessActivity={context.business.businessActivity} />
    <section className="panel tablePanel"><div className="panelHeader tableHeader"><div><span className="eyebrow">الإعدادات المحفوظة</span><h2>طريقة بيع المنتجات</h2></div><Boxes size={20} /></div><div className="tableScroll"><table className="dataTable"><thead><tr><th>المنتج</th><th>طريقة البيع</th><th>المقاس</th><th>اللون</th><th>مجموعة المتغيرات</th></tr></thead><tbody>{parsed.map(({ row, config }) => <tr key={row.id}><td><strong>{row.listingId ? productMap.get(row.listingId)?.name || row.itemName : row.itemName}</strong></td><td>{modeLabels[config.saleMode || "STANDARD"] || config.saleMode}</td><td>{config.size || "—"}</td><td>{config.color || "—"}</td><td>{config.variantGroup || "—"}</td></tr>)}{!parsed.length && <tr><td colSpan={5}><div className="infoNote">المنتجات العادية تعمل مباشرة. خصص فقط الحالات الخاصة التي يحتاجها نشاطك.</div></td></tr>}</tbody></table></div></section>
  </>;
}
