import { redirect } from "next/navigation";
import { CalendarClock, PackageSearch, TrendingUp } from "lucide-react";
import { firstPermissionHref, hasAppPermission } from "@/lib/access";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "توقع الطلب" };
export const dynamic = "force-dynamic";

export default async function SupplierForecastPage() {
  const context = await getSessionContext(); if (!context) redirect("/login");
  if (!["SUPPLIER", "BOTH"].includes(context.business.businessType)) redirect("/");
  if (!hasAppPermission(context.membership, "INVENTORY")) redirect(firstPermissionHref(context.membership));
  const since = new Date(); since.setDate(since.getDate() - 56);
  const midpoint = new Date(); midpoint.setDate(midpoint.getDate() - 28);
  const [listings, orders] = await Promise.all([
    db.marketplaceListing.findMany({ where: { sellerBusinessId: context.business.id, active: true }, orderBy: { name: "asc" }, take: 1500 }),
    db.marketplaceOrder.findMany({ where: { sellerBusinessId: context.business.id, status: "RECEIVED", receivedAt: { gte: since } }, include: { items: true }, orderBy: { receivedAt: "asc" }, take: 3000 }),
  ]);
  const demand = new Map<string, { total56: number; recent28: number; prior28: number }>();
  for (const order of orders) for (const item of order.items) {
    const current = demand.get(item.listingId) ?? { total56: 0, recent28: 0, prior28: 0 };
    const qty = Number(item.quantity); current.total56 += qty;
    if ((order.receivedAt ?? order.createdAt) >= midpoint) current.recent28 += qty; else current.prior28 += qty;
    demand.set(item.listingId, current);
  }
  const rows = listings.map((listing) => {
    const history = demand.get(listing.id) ?? { total56: 0, recent28: 0, prior28: 0 };
    const weeklyForecast = history.total56 / 8;
    const stock = Number(listing.quantity);
    const weeksCover = weeklyForecast > 0 ? stock / weeklyForecast : null;
    const shortage7 = Math.max(0, Math.ceil(weeklyForecast - stock));
    const trend = history.prior28 > 0 ? ((history.recent28 - history.prior28) / history.prior28) * 100 : history.recent28 > 0 ? 100 : 0;
    return { listing, history, weeklyForecast, stock, weeksCover, shortage7, trend };
  }).sort((a, b) => b.shortage7 - a.shortage7 || b.weeklyForecast - a.weeklyForecast);
  const withHistory = rows.filter((x) => x.history.total56 > 0);
  const shortages = rows.filter((x) => x.shortage7 > 0);
  const forecastTotal = withHistory.reduce((s, x) => s + x.weeklyForecast, 0);
  return <>
    <PageHeader eyebrow="المورد" title="توقع الطلب" description="تِجرا يقرأ الكميات التي استلمها التجار خلال آخر 8 أسابيع ويحوّلها إلى توقع أسبوعي بسيط وشفاف؛ بدون أرقام مصطنعة أو خدمة AI مدفوعة." />
    <section className="metricsGrid three"><MetricCard label="طلب أسبوعي متوقع" value={Math.round(forecastTotal).toLocaleString("ar-SA")} note="من المنتجات ذات التاريخ" icon={TrendingUp} /><MetricCard label="أصناف معرضة للنقص" value={`${shortages.length}`} note="المخزون أقل من توقع 7 أيام" icon={PackageSearch} tone="amber" /><MetricCard label="أسابيع بيانات" value="8" note={`${orders.length} طلب مستلم داخل الفترة`} icon={CalendarClock} tone="violet" /></section>
    <section className="panel tablePanel"><div className="panelHeader tableHeader"><div><span className="eyebrow">التوقع</span><h2>ما قد يطلبه التجار الأسبوع القادم</h2></div></div><div className="tableScroll"><table className="dataTable"><thead><tr><th>الصنف</th><th>طلب 8 أسابيع</th><th>متوقع 7 أيام</th><th>المخزون</th><th>التغطية</th><th>التغير</th><th>المقترح</th></tr></thead><tbody>{rows.map((row) => <tr key={row.listing.id}><td><strong>{row.listing.name}</strong></td><td>{row.history.total56.toLocaleString("ar-SA")}</td><td>{row.weeklyForecast.toFixed(1)}</td><td>{row.stock.toLocaleString("ar-SA")}</td><td>{row.weeksCover == null ? "لا توجد بيانات كافية" : `${row.weeksCover.toFixed(1)} أسبوع`}</td><td className={row.trend > 10 ? "positive" : row.trend < -10 ? "dangerText" : ""}>{row.history.total56 ? `${row.trend >= 0 ? "+" : ""}${Math.round(row.trend)}%` : "—"}</td><td className={row.shortage7 ? "dangerText" : "positive"}>{row.shortage7 ? `أضف ≈ ${row.shortage7}` : "مخزون كافٍ للأسبوع"}</td></tr>)}{!rows.length && <tr><td colSpan={7}><div className="infoNote">أضف منتجات للمورد ليبدأ توقع الطلب.</div></td></tr>}</tbody></table></div></section>
  </>;
}
