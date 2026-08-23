import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, Boxes, ClipboardCheck, ShoppingCart, Store, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";

export const metadata = { title: "مركز النشاط" };
export const dynamic = "force-dynamic";

type Item = { id: string; at: Date; title: string; detail: string; actor?: string; href?: string; type: "stock" | "sale" | "order" | "customer" };

const actionLabels: Record<string, string> = {
  COUNT: "جرد المورد",
  STORE_COUNT: "جرد المتجر",
  EXTERNAL_SALE: "بيع خارجي",
  OUTBOUND_ORDER: "إخراج طلب تاجر",
  ORDER_CANCEL_RESTORE: "إرجاع بعد إلغاء",
  STOCK_IN: "إدخال مخزون",
  STOCK_OUT: "إخراج مخزون",
  CASHIER_SALE: "عملية كاشير",
  RECIPE_SALE: "استهلاك وصفة",
  WASTE: "هدر",
  CUSTOMER_RETURN: "مرتجع عميل",
  SUPPLIER_RETURN: "مرتجع للمورد",
  DAMAGED: "تالف / غير صالح",
  SMART_RECEIPT: "استلام ذكي",
  LOCATION_TRANSFER: "تحويل بين المواقع",
  DAY_CLOSE: "إقفال نهاية اليوم",
  DAY_CLOSE_ADJUSTMENT: "تسوية إقفال",
  SHIFT: "وردية كاشير",
  PICK_PROGRESS: "تجهيز طلب بالمسح",
  PICK_COMPLETE: "اكتمل تجهيز الطلب",
  LISTING_PRICE_TIER: "تحديث سعر كمية",
  PRODUCT_SERIAL: "حركة Serial / IMEI",
  SERVICE_SALE: "بيع خدمة",
};

function eventHref(action: string, supplierMode: boolean) {
  if (["CUSTOMER_RETURN", "SUPPLIER_RETURN", "DAMAGED"].includes(action)) return "/inventory/returns";
  if (action === "SMART_RECEIPT") return "/inventory/receiving";
  if (action === "LOCATION_TRANSFER") return "/inventory/locations";
  if (action === "SHIFT") return "/sales/shifts";
  if (action === "PICK_PROGRESS" || action === "PICK_COMPLETE") return "/supplier/picking";
  if (action === "LISTING_PRICE_TIER") return "/supplier/pricing";
  if (action === "CASHIER_SALE" || action === "SERVICE_SALE") return "/sales";
  return supplierMode ? "/supplier/stock-count" : "/inventory/audit";
}

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  const params = await searchParams;
  const supplierMode = context.business.businessType === "SUPPLIER" || (context.business.businessType === "BOTH" && params.mode === "supplier");
  const businessId = context.business.id;

  const [events, orders] = await Promise.all([
    db.inventoryAuditEvent.findMany({ where: { businessId }, orderBy: { occurredAt: "desc" }, take: 160 }),
    db.marketplaceOrder.findMany({
      where: supplierMode ? { sellerBusinessId: businessId } : { buyerBusinessId: businessId },
      include: { buyer: true, seller: true, items: { include: { listing: true } } },
      orderBy: { updatedAt: "desc" },
      take: 80,
    }),
  ]);

  const items: Item[] = [];
  for (const event of events) {
    if (["LOCATION_STOCK", "LOCATION_CONFIG", "UNIT_CONVERSION", "LOT_STOCK", "PRODUCT_CONFIG", "RECIPE_COMPONENT"].includes(event.action)) continue;
    items.push({
      id: `event-${event.id}`,
      at: event.occurredAt,
      title: actionLabels[event.action] || event.action,
      detail: `${event.itemName || "المخزون"}${event.quantity != null ? ` · ${Number(event.quantity).toLocaleString("ar-SA")}` : ""}${event.previousQuantity != null && event.newQuantity != null ? ` · ${Number(event.previousQuantity).toLocaleString("ar-SA")} ← ${Number(event.newQuantity).toLocaleString("ar-SA")}` : ""}`,
      actor: event.actorName,
      href: eventHref(event.action, supplierMode),
      type: event.action === "CASHIER_SALE" || event.action === "SERVICE_SALE" ? "sale" : "stock",
    });
  }
  for (const order of orders) {
    const party = supplierMode ? order.buyer.name : order.seller.name;
    items.push({
      id: `order-${order.id}`,
      at: order.updatedAt,
      title: order.status === "PLACED" ? "طلب جديد" : order.status === "ACCEPTED" ? "طلب مقبول" : order.status === "RECEIVED" ? "طلب مستلم" : "طلب ملغي",
      detail: `${party} · ${order.items.map((item) => item.listing.name).slice(0, 2).join("، ")} · ${formatSar(Number(order.expectedTotal))}`,
      href: supplierMode ? "/marketplace/seller#orders" : "/marketplace/orders",
      type: "order",
    });
  }
  items.sort((a, b) => b.at.getTime() - a.at.getTime());
  const recent = items.slice(0, 120);

  const Icon = ({ type }: { type: Item["type"] }) => type === "sale" ? <ShoppingCart size={17} /> : type === "order" ? <Store size={17} /> : type === "customer" ? <UsersRound size={17} /> : <Boxes size={17} />;

  return <><PageHeader eyebrow="المتابعة" title="مركز النشاط" description={supplierMode ? "كل ما يحدث في البيع والمخزون والجرد والطلبات ومن نفذ العملية في مكان واحد." : "المبيعات والجرد والمخزون والطلبات والمرتجعات في خط زمني واحد."} actions={<Link className="button secondary" href={supplierMode ? "/supplier/alerts" : "/smart-alerts"}><Activity size={17} /> التنبيهات الذكية</Link>} /><section className="panel activityPanel"><div className="activityTimeline">{recent.map((item) => <div className="activityItem" key={item.id}><div className={`activityIcon ${item.type}`}><Icon type={item.type} /></div><div className="activityBody"><div><strong>{item.title}</strong><time>{new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(item.at)}</time></div><p>{item.detail}</p>{item.actor ? <span className="activityActor"><ClipboardCheck size={13} /> بواسطة {item.actor}</span> : null}</div>{item.href ? <Link className="textLink" href={item.href}>فتح</Link> : null}</div>)}{!recent.length && <div className="infoNote">لا يوجد نشاط مسجل بعد.</div>}</div></section></>;
}
