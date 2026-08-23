import Link from "next/link";
import { redirect } from "next/navigation";
import { BellRing, Boxes, RotateCcw, Sparkles, Tags } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";

export const metadata = { title: "التنبيهات الذكية" };
export const dynamic = "force-dynamic";

function normalize(value: string) {
  return value.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export default async function SmartAlertsPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!["RETAILER", "BOTH"].includes(context.business.businessType)) redirect("/supplier/alerts");
  const businessId = context.business.id;
  const [products, orders, listings] = await Promise.all([
    db.product.findMany({ where: { businessId, active: true }, orderBy: { quantity: "asc" }, take: 500 }),
    db.marketplaceOrder.findMany({ where: { buyerBusinessId: businessId, status: "RECEIVED" }, include: { seller: true, items: { include: { listing: true } } }, orderBy: { receivedAt: "desc" }, take: 100 }),
    db.marketplaceListing.findMany({ where: { active: true, quantity: { gt: 0 }, sellerBusinessId: { not: businessId } }, include: { seller: true }, orderBy: { price: "asc" }, take: 3000 }),
  ]);

  const lowStock = products.filter((product) => Number(product.quantity) <= Math.max(1, Number(product.reorderPoint)));
  const repeatCutoff = new Date(); repeatCutoff.setDate(repeatCutoff.getDate() - 14);
  const seen = new Set<string>();
  const reorderCandidates = orders.filter((order) => {
    if (seen.has(order.sellerBusinessId)) return false;
    seen.add(order.sellerBusinessId);
    return (order.receivedAt ?? order.createdAt) < repeatCutoff;
  }).slice(0, 6);

  const priceWins: Array<{ name: string; oldPrice: number; newPrice: number; seller: string }> = [];
  for (const order of orders.slice(0, 30)) for (const item of order.items) {
    const key = normalize(item.listing.name);
    const best = listings.find((listing) => item.listing.barcode ? listing.barcode === item.listing.barcode : normalize(listing.name) === key && listing.unit === item.listing.unit);
    if (best && Number(best.price) + 0.01 < Number(item.unitPrice)) priceWins.push({ name: item.listing.name, oldPrice: Number(item.unitPrice), newPrice: Number(best.price), seller: best.seller.name });
  }
  const uniquePriceWins = [...new Map(priceWins.map((item) => [item.name, item])).values()].slice(0, 8);

  return <><PageHeader eyebrow="المساعد الذكي" title="التنبيهات الذكية" description="الأشياء التي تحتاج قرارك الآن: مخزون منخفض، إعادة طلب محتملة، وسعر أفضل من آخر شراء." /><section className="metricsGrid three"><MetricCard label="مخزون منخفض" value={`${lowStock.length}`} note="أصناف وصلت نقطة إعادة الطلب" icon={Boxes} /><MetricCard label="قد تحتاج إعادة طلب" value={`${reorderCandidates.length}`} note="مر 14+ يوم على آخر طلب" icon={RotateCcw} tone="amber" /><MetricCard label="أسعار أفضل من آخر شراء" value={`${uniquePriceWins.length}`} note="لنفس الصنف والوحدة" icon={Tags} tone="blue" /></section><section className="workflowGrid two"><article className="panel workflowPanel"><div className="panelHeader"><div><span className="eyebrow"><Boxes size={14} /> المخزون</span><h2>أصناف تحتاج انتباه</h2></div><Link className="textLink" href="/smart-buy">خطة الأسبوع</Link></div><div className="alertList">{lowStock.slice(0, 8).map((product) => <div className="workflowAlert" key={product.id}><div><strong>{product.name}</strong><span>المتوفر {Number(product.quantity).toLocaleString("ar-SA")} {product.unit} · نقطة الطلب {Number(product.reorderPoint).toLocaleString("ar-SA")}</span></div><Link href={`/marketplace?q=${encodeURIComponent(product.name)}`}>ابحث بالسوق</Link></div>)}{!lowStock.length && <div className="infoNote">لا توجد أصناف تحت نقطة إعادة الطلب.</div>}</div></article><article className="panel workflowPanel"><div className="panelHeader"><div><span className="eyebrow"><Sparkles size={14} /> السعر</span><h2>أفضل من آخر شراء</h2></div><Link className="textLink" href="/alerts">السعر الأذكى</Link></div><div className="alertList">{uniquePriceWins.map((item) => <div className="workflowAlert" key={item.name}><div><strong>{item.name}</strong><span>{item.seller}: {formatSar(item.newPrice)} بدل {formatSar(item.oldPrice)}</span></div><Link href={`/marketplace?q=${encodeURIComponent(item.name)}`}>مقارنة</Link></div>)}{!uniquePriceWins.length && <div className="infoNote">لا يوجد سعر حالي أفضل من آخر مشترياتك المسجلة.</div>}</div></article></section><section className="panel workflowPanel"><div className="panelHeader"><div><span className="eyebrow"><BellRing size={14} /> التكرار</span><h2>قد يكون وقت إعادة الطلب</h2></div><Link className="textLink" href="/reorder">إعادة الطلب</Link></div><div className="alertList">{reorderCandidates.map((order) => <div className="workflowAlert" key={order.id}><div><strong>{order.seller.name}</strong><span>{order.items.map((item) => item.listing.name).join("، ")} · آخر استلام {new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(order.receivedAt ?? order.createdAt)}</span></div><Link href="/reorder">راجع</Link></div>)}{!reorderCandidates.length && <div className="infoNote">لا توجد طلبات قديمة تحتاج تذكيرًا الآن.</div>}</div></section></>;
}
