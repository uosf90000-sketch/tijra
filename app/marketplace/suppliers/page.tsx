import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock3, PackageCheck, ShieldCheck, Store } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "الموردون" };
export const dynamic = "force-dynamic";

export default async function MarketplaceSuppliersPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");

  const listings = await db.marketplaceListing.findMany({
    where: { active: true, quantity: { gt: 0 }, sellerBusinessId: { not: context.business.id } },
    include: { seller: true },
    orderBy: { updatedAt: "desc" },
    take: 3000,
  });
  const sellerIds = [...new Set(listings.map((item) => item.sellerBusinessId))];
  const orders = sellerIds.length ? await db.marketplaceOrder.findMany({ where: { sellerBusinessId: { in: sellerIds } }, select: { sellerBusinessId: true, status: true, createdAt: true, acceptedAt: true } }) : [];

  const stats = sellerIds.map((sellerId) => {
    const sellerListings = listings.filter((item) => item.sellerBusinessId === sellerId);
    const seller = sellerListings[0].seller;
    const sellerOrders = orders.filter((order) => order.sellerBusinessId === sellerId);
    const completed = sellerOrders.filter((order) => order.status === "ACCEPTED" || order.status === "RECEIVED").length;
    const cancelled = sellerOrders.filter((order) => order.status === "CANCELLED").length;
    const decided = completed + cancelled;
    const acceptance = decided ? (completed / decided) * 100 : null;
    const responses = sellerOrders.filter((order) => order.acceptedAt).map((order) => ((order.acceptedAt as Date).getTime() - order.createdAt.getTime()) / 60000).filter((value) => value >= 0);
    const responseMinutes = responses.length ? responses.reduce((a, b) => a + b, 0) / responses.length : null;
    const latestUpdate = sellerListings.reduce((latest, item) => item.updatedAt > latest ? item.updatedAt : latest, sellerListings[0].updatedAt);
    return { seller, listingCount: sellerListings.length, acceptance, responseMinutes, latestUpdate, stock: sellerListings.reduce((sum, item) => sum + Number(item.quantity), 0) };
  }).sort((a, b) => (b.acceptance ?? 0) - (a.acceptance ?? 0) || b.listingCount - a.listingCount);

  const freshToday = stats.filter((item) => Date.now() - item.latestUpdate.getTime() < 86400000).length;
  const avgAcceptanceRows = stats.filter((item) => item.acceptance != null);
  const avgAcceptance = avgAcceptanceRows.length ? avgAcceptanceRows.reduce((sum, item) => sum + (item.acceptance ?? 0), 0) / avgAcceptanceRows.length : 0;

  return (
    <>
      <PageHeader eyebrow="السوق" title="الموردون" description="لا تختار بالسعر فقط. شوف تحديث المخزون، نسبة قبول الطلبات، سرعة الرد، وعدد المنتجات قبل ما تطلب." />
      <section className="metricsGrid three">
        <MetricCard label="موردون متاحون" value={`${stats.length}`} note="لديهم مخزون معروض" icon={Store} />
        <MetricCard label="مخزون محدث اليوم" value={`${freshToday}`} note="موردون حدثوا عروضهم خلال 24 ساعة" icon={PackageCheck} tone="blue" />
        <MetricCard label="متوسط قبول الطلبات" value={`${Math.round(avgAcceptance)}%`} note="للموردين ذوي سجل طلبات" icon={ShieldCheck} tone="amber" />
      </section>
      <section className="supplierDirectoryGrid">
        {stats.map((item) => <article className="panel supplierTrustCard" key={item.seller.id}>
          <div className="supplierTrustHead"><div className="supplierAvatar">{item.seller.name.slice(0, 1)}</div><div><h2>{item.seller.name}</h2><span>{item.seller.city || "السعودية"}</span></div></div>
          <div className="trustMetrics"><div><ShieldCheck size={16} /><strong>{item.acceptance == null ? "جديد" : `${Math.round(item.acceptance)}%`}</strong><span>قبول الطلبات</span></div><div><Clock3 size={16} /><strong>{item.responseMinutes == null ? "—" : item.responseMinutes < 60 ? `${Math.round(item.responseMinutes)} د` : `${(item.responseMinutes / 60).toFixed(1)} س`}</strong><span>متوسط الرد</span></div><div><PackageCheck size={16} /><strong>{item.listingCount}</strong><span>منتج متوفر</span></div></div>
          <div className="supplierFreshness"><span>آخر تحديث للمخزون</span><strong>{new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(item.latestUpdate)}</strong></div>
          <Link className="button secondary compact" href={`/marketplace?q=${encodeURIComponent(item.seller.name)}`}>عرض منتجات المورد</Link>
        </article>)}
        {!stats.length && <div className="panel workflowEmpty"><Store size={28} /><h2>لا يوجد موردون متاحون الآن</h2></div>}
      </section>
    </>
  );
}
