import { redirect } from "next/navigation";
import { BadgePercent, Tags, UsersRound } from "lucide-react";
import { PriceTierForm } from "@/components/commerce-forms";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { safeJson } from "@/lib/commerce-ops";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";

export const metadata = { title: "تسعير المورد المتقدم" };
export const dynamic = "force-dynamic";

export default async function SupplierPricingPage() {
  const context = await getSessionContext(); if (!context) redirect("/login");
  if (!["SUPPLIER", "BOTH"].includes(context.business.businessType)) redirect("/");
  const [listings, orders, tiers] = await Promise.all([
    db.marketplaceListing.findMany({ where: { sellerBusinessId: context.business.id, active: true }, orderBy: { name: "asc" }, take: 1000 }),
    db.marketplaceOrder.findMany({ where: { sellerBusinessId: context.business.id }, include: { buyer: true }, orderBy: { createdAt: "desc" }, take: 1000 }),
    db.inventoryAuditEvent.findMany({ where: { businessId: context.business.id, action: "LISTING_PRICE_TIER" }, orderBy: { occurredAt: "desc" }, take: 1000 }),
  ]);
  const customerMap = new Map<string, string>(); for (const order of orders) customerMap.set(order.buyerBusinessId, order.buyer.name);
  const listingMap = new Map(listings.map((x) => [x.id, x]));
  const parsed = tiers.map((row) => ({ row, cfg: safeJson<{ customerBusinessId?: string | null; validUntil?: string | null }>(row.note, {}) }));
  const specific = parsed.filter((x) => x.cfg.customerBusinessId).length;
  return <>
    <PageHeader eyebrow="المورد" title="تسعير متقدم" description="ضع سعرًا حسب كمية الطلب، عرضًا حتى تاريخ محدد، أو سعرًا خاصًا لتاجر معين. يطبقه تِجرا تلقائيًا عند إنشاء الطلب." />
    <section className="metricsGrid three"><MetricCard label="المنتجات" value={`${listings.length}`} note="معروضة في السوق" icon={Tags} /><MetricCard label="مستويات أسعار" value={`${tiers.length}`} note="أسعار كمية وعروض" icon={BadgePercent} tone="blue" /><MetricCard label="أسعار خاصة" value={`${specific}`} note="مرتبطة بتاجر محدد" icon={UsersRound} tone="violet" /></section>
    <PriceTierForm listings={listings.map((x) => ({ id: x.id, name: x.name, price: Number(x.price), minOrderQty: Number(x.minOrderQty) }))} customers={[...customerMap.entries()].map(([id, name]) => ({ id, name }))} />
    <section className="panel tablePanel"><div className="panelHeader tableHeader"><div><span className="eyebrow">الأسعار الحالية</span><h2>مستويات السعر</h2></div></div><div className="tableScroll"><table className="dataTable"><thead><tr><th>المنتج</th><th>من كمية</th><th>السعر</th><th>التاجر</th><th>صالح حتى</th></tr></thead><tbody>{parsed.map(({ row, cfg }) => <tr key={row.id}><td><strong>{row.listingId ? listingMap.get(row.listingId)?.name || row.itemName : row.itemName}</strong></td><td>{Number(row.quantity ?? 0).toLocaleString("ar-SA")}</td><td>{formatSar(Number(row.previousQuantity ?? 0))}</td><td>{cfg.customerBusinessId ? customerMap.get(cfg.customerBusinessId) || "تاجر محدد" : "كل التجار"}</td><td>{cfg.validUntil ? new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(new Date(cfg.validUntil)) : "مفتوح"}</td></tr>)}{!parsed.length && <tr><td colSpan={5}><div className="infoNote">مثال: من 10 كراتين بسعر 68 ر.س، ومن 50 كرتون بسعر 64 ر.س.</div></td></tr>}</tbody></table></div></section>
  </>;
}
