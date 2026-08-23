import { redirect } from "next/navigation";
import { ClipboardCheck, ScanBarcode, ShoppingBasket } from "lucide-react";
import { PickingForm } from "@/components/commerce-forms";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { firstPermissionHref, hasAppPermission } from "@/lib/access";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "تجهيز الطلبات بالمسح" };
export const dynamic = "force-dynamic";

export default async function SupplierPickingPage() {
  const context = await getSessionContext(); if (!context) redirect("/login");
  if (!["SUPPLIER", "BOTH"].includes(context.business.businessType)) redirect("/");
  if (!hasAppPermission(context.membership, "INVENTORY")) redirect(firstPermissionHref(context.membership));
  const orders = await db.marketplaceOrder.findMany({ where: { sellerBusinessId: context.business.id, status: { in: ["PLACED", "ACCEPTED"] } }, include: { buyer: true, items: { include: { listing: true } } }, orderBy: { createdAt: "asc" }, take: 100 });
  const ids = orders.map((x) => x.id);
  const progress = ids.length ? await db.inventoryAuditEvent.findMany({ where: { businessId: context.business.id, action: { in: ["PICK_PROGRESS", "PICK_COMPLETE"] }, orderId: { in: ids } } }) : [];
  const progressMap = new Map<string, number>(); const complete = new Set<string>();
  for (const row of progress) { if (!row.orderId) continue; if (row.action === "PICK_COMPLETE") complete.add(row.orderId); else progressMap.set(`${row.orderId}:${row.listingId}`, Number(row.quantity ?? 0)); }
  const totalRequired = orders.reduce((s, order) => s + order.items.reduce((n, item) => n + Number(item.quantity), 0), 0);
  const totalScanned = orders.reduce((s, order) => s + order.items.reduce((n, item) => n + Math.min(Number(item.quantity), progressMap.get(`${order.id}:${item.listingId}`) ?? 0), 0), 0);
  return <>
    <PageHeader eyebrow="المورد" title="تجهيز الطلبات بالمسح" description="افتح الطلب وامسح كل صنف. الباركود الخطأ يُرفض، وتِجرا يوضح كم جهز الموظف حتى يكتمل الطلب." />
    <section className="metricsGrid three"><MetricCard label="طلبات قيد التجهيز" value={`${orders.length}`} note="طلب جديد أو مقبول" icon={ShoppingBasket} /><MetricCard label="وحدات مطلوبة" value={totalRequired.toLocaleString("ar-SA")} note="عبر الطلبات المفتوحة" icon={ScanBarcode} tone="blue" /><MetricCard label="تم مسحها" value={totalScanned.toLocaleString("ar-SA")} note={`${complete.size} طلب مكتمل المسح`} icon={ClipboardCheck} tone="violet" /></section>
    <PickingForm orders={orders.map((order) => ({ id: order.id, buyerName: `${order.buyer.name} · ${order.id.slice(-8).toUpperCase()}`, totalItems: order.items.reduce((s, x) => s + Number(x.quantity), 0) }))} />
    <section className="panel tablePanel"><div className="panelHeader tableHeader"><div><span className="eyebrow">التقدم</span><h2>حالة تجهيز الطلبات</h2></div></div><div className="tableScroll"><table className="dataTable"><thead><tr><th>الطلب</th><th>التاجر</th><th>الصنف</th><th>المطلوب</th><th>الممسوح</th><th>الحالة</th></tr></thead><tbody>{orders.flatMap((order) => order.items.map((item) => { const scanned = progressMap.get(`${order.id}:${item.listingId}`) ?? 0; const required = Number(item.quantity); return <tr key={item.id}><td>{order.id.slice(-8).toUpperCase()}</td><td>{order.buyer.name}</td><td><strong>{item.listing.name}</strong><span className="mutedText" style={{ display: "block" }}>{item.listing.barcode || "لا يوجد باركود — يحتاج تحديث المنتج"}</span></td><td>{required.toLocaleString("ar-SA")}</td><td>{scanned.toLocaleString("ar-SA")}</td><td className={scanned >= required ? "positive" : "warningText"}>{scanned >= required ? "جاهز" : "قيد التجهيز"}</td></tr>; }))}{!orders.length && <tr><td colSpan={6}><div className="infoNote">لا توجد طلبات مفتوحة للتجهيز.</div></td></tr>}</tbody></table></div></section>
  </>;
}
