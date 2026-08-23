import Link from "next/link";
import { redirect } from "next/navigation";
import { BellRing, Boxes, ClockAlert, ClipboardList, Tags } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "تنبيهات المورد" };
export const dynamic = "force-dynamic";

function normalize(value: string) {
  return value.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export default async function SupplierAlertsPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!["SUPPLIER", "BOTH"].includes(context.business.businessType)) redirect("/smart-alerts");
  const businessId = context.business.id;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
  const [listings, orders, received, market] = await Promise.all([
    db.marketplaceListing.findMany({ where: { sellerBusinessId: businessId, active: true }, orderBy: { quantity: "asc" }, take: 1000 }),
    db.marketplaceOrder.findMany({ where: { sellerBusinessId: businessId, status: { in: ["PLACED", "ACCEPTED"] } }, include: { buyer: true, items: { include: { listing: true } } }, orderBy: { createdAt: "asc" }, take: 100 }),
    db.marketplaceOrder.findMany({ where: { sellerBusinessId: businessId, status: "RECEIVED" }, include: { buyer: true }, orderBy: { receivedAt: "desc" }, take: 2000 }),
    db.marketplaceListing.findMany({ where: { sellerBusinessId: { not: businessId }, active: true, quantity: { gt: 0 } }, orderBy: { price: "asc" }, take: 4000 }),
  ]);
  const low = listings.filter((item) => Number(item.quantity) <= Math.max(5, Number(item.minOrderQty)));
  const buyerMap = new Map<string, { name: string; last: Date }>();
  for (const order of received) {
    const date = order.receivedAt ?? order.createdAt;
    const current = buyerMap.get(order.buyerBusinessId);
    if (!current || date > current.last) buyerMap.set(order.buyerBusinessId, { name: order.buyer.name, last: date });
  }
  const dormant = [...buyerMap.values()].filter((buyer) => buyer.last < cutoff).sort((a, b) => a.last.getTime() - b.last.getTime());
  const overpriced = listings.map((listing) => {
    const key = normalize(listing.name);
    const best = market.find((candidate) => listing.barcode ? candidate.barcode === listing.barcode : normalize(candidate.name) === key && candidate.unit === listing.unit);
    return best && Number(listing.price) > Number(best.price) * 1.05 ? { listing, best } : null;
  }).filter(Boolean).slice(0, 8) as Array<{ listing: typeof listings[number]; best: typeof market[number] }>;

  return <><PageHeader eyebrow="المساعد الذكي" title="تنبيهات المورد" description="طلبات تنتظر، مخزون منخفض، تجار توقفوا عن الشراء، وأسعار تحتاج مراجعة." /><section className="metricsGrid four"><MetricCard label="طلبات تحتاج إجراء" value={`${orders.length}`} note="جديدة أو مقبولة" icon={ClipboardList} /><MetricCard label="مخزون منخفض" value={`${low.length}`} note="قرب الحد الأدنى" icon={Boxes} tone="amber" /><MetricCard label="تجار غير نشطين" value={`${dormant.length}`} note="30+ يوم بدون شراء" icon={ClockAlert} tone="violet" /><MetricCard label="أسعار أعلى من السوق" value={`${overpriced.length}`} note="أعلى بأكثر من 5%" icon={Tags} tone="blue" /></section><section className="workflowGrid two"><article className="panel workflowPanel"><div className="panelHeader"><div><span className="eyebrow"><ClipboardList size={14} /> الطلبات</span><h2>تحتاج إجراء الآن</h2></div><Link className="textLink" href="/marketplace/seller#orders">فتح الطلبات</Link></div><div className="alertList">{orders.slice(0, 8).map((order) => <div className="workflowAlert" key={order.id}><div><strong>{order.buyer.name}</strong><span>{order.items.map((item) => `${item.listing.name} × ${Number(item.quantity).toLocaleString("ar-SA")}`).join("، ")}</span></div><Link href="/marketplace/seller#orders">فتح</Link></div>)}{!orders.length && <div className="infoNote">لا توجد طلبات معلقة.</div>}</div></article><article className="panel workflowPanel"><div className="panelHeader"><div><span className="eyebrow"><Boxes size={14} /> المخزون</span><h2>أصناف منخفضة</h2></div><Link className="textLink" href="/supplier/stock-update">تحديث</Link></div><div className="alertList">{low.slice(0, 8).map((item) => <div className="workflowAlert" key={item.id}><div><strong>{item.name}</strong><span>المتوفر {Number(item.quantity).toLocaleString("ar-SA")} {item.unit}</span></div><Link href="/supplier/stock-update">تحديث</Link></div>)}{!low.length && <div className="infoNote">المخزون بحالة جيدة.</div>}</div></article></section><section className="workflowGrid two"><article className="panel workflowPanel"><div className="panelHeader"><div><span className="eyebrow"><ClockAlert size={14} /> العملاء</span><h2>تجار توقفوا عن الشراء</h2></div><Link className="textLink" href="/supplier/dormant">عرض الكل</Link></div><div className="alertList">{dormant.slice(0, 8).map((buyer) => <div className="workflowAlert" key={`${buyer.name}-${buyer.last.toISOString()}`}><div><strong>{buyer.name}</strong><span>آخر شراء {new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(buyer.last)}</span></div><Link href="/supplier/dormant">متابعة</Link></div>)}{!dormant.length && <div className="infoNote">لا يوجد عميل سابق متوقف أكثر من 30 يوم.</div>}</div></article><article className="panel workflowPanel"><div className="panelHeader"><div><span className="eyebrow"><Tags size={14} /> الأسعار</span><h2>تحتاج مراجعة</h2></div><Link className="textLink" href="/supplier/price-intelligence">ذكاء الأسعار</Link></div><div className="alertList">{overpriced.map(({ listing, best }) => <div className="workflowAlert" key={listing.id}><div><strong>{listing.name}</strong><span>سعرك أعلى من أفضل السوق بـ {Math.round(((Number(listing.price) - Number(best.price)) / Number(best.price)) * 100)}%</span></div><Link href="/supplier/price-intelligence">راجع</Link></div>)}{!overpriced.length && <div className="infoNote">لا توجد فروقات سعرية كبيرة الآن.</div>}</div></article></section></>;
}
