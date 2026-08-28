import Link from "next/link";
import { redirect } from "next/navigation";
import { Boxes, CirclePlus, ClipboardCheck, Clock3, ScanLine, ShoppingBasket, Store, UsersRound } from "lucide-react";
import { MarketplaceListingForm } from "@/components/marketplace-listing-form";
import { MarketplaceOrderActions } from "@/components/marketplace-order-actions";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { SupplierExternalSaleForm } from "@/components/supplier-external-sale-form";
import { SupplierInventoryAuditForm } from "@/components/supplier-inventory-audit-form";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";

export const metadata = { title: "لوحة المورد" };
export const dynamic = "force-dynamic";

const statusLabels: Record<string, string> = { PLACED: "طلب جديد", ACCEPTED: "تم القبول", RECEIVED: "استلمه التاجر", CANCELLED: "ملغي" };
const auditActionLabels: Record<string, string> = { COUNT: "جرد مخزون", EXTERNAL_SALE: "إخراج بيع خارجي", OUTBOUND_ORDER: "إخراج طلب تاجر", ORDER_CANCEL_RESTORE: "إرجاع بعد إلغاء" };
const stockUpdateFormatter = new Intl.DateTimeFormat("ar-SA", { dateStyle: "short", timeStyle: "short" });

export default async function MarketplaceSellerPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!["SUPPLIER", "BOTH"].includes(context.business.businessType)) redirect("/marketplace");

  const [listings, listingCount, orders, auditEvents] = await Promise.all([
    db.marketplaceListing.findMany({ where: { sellerBusinessId: context.business.id }, orderBy: { updatedAt: "desc" }, take: 100 }),
    db.marketplaceListing.count({ where: { sellerBusinessId: context.business.id } }),
    db.marketplaceOrder.findMany({ where: { sellerBusinessId: context.business.id }, include: { buyer: true, items: { include: { listing: true } } }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.inventoryAuditEvent.findMany({ where: { businessId: context.business.id }, orderBy: { occurredAt: "desc" }, take: 50 }),
  ]);

  const stockValue = listings.reduce((sum, item) => sum + Number(item.quantity) * Number(item.price), 0);
  const openOrders = orders.filter((order) => order.status === "PLACED" || order.status === "ACCEPTED");
  const listingOptions = listings.map((item) => ({ id: item.id, name: item.name, barcode: item.barcode, unit: item.unit, quantity: Number(item.quantity) }));
  const customerMap = new Map<string, { id: string; name: string; city: string; orders: number; total: number }>();
  for (const order of orders) {
    const current = customerMap.get(order.buyerBusinessId);
    if (current) { current.orders += 1; current.total += Number(order.expectedTotal); }
    else customerMap.set(order.buyerBusinessId, { id: order.buyerBusinessId, name: order.buyer.name, city: order.buyer.city || "غير محددة", orders: 1, total: Number(order.expectedTotal) });
  }
  const customers = [...customerMap.values()].sort((a, b) => b.orders - a.orders || b.total - a.total).slice(0, 8);

  return <>
    <PageHeader eyebrow="حساب المورد" title="متجرك في تِجرا" description="اعرض بضاعتك وأسعارك ومخزونك للتجار، واستقبل طلباتهم مباشرة داخل السوق." actions={<div className="pageActionGroup"><Link className="button secondary" href="/supplier/import">استيراد المنتجات</Link><Link className="button secondary" href="/marketplace"><Store size={17} /> عرض السوق</Link></div>} />
    <section className="metricsGrid three">
      <MetricCard label="المنتجات المعروضة" value={listingCount.toLocaleString("ar-SA")} note={listingCount > listings.length ? `يعرض الجدول أحدث ${listings.length.toLocaleString("ar-SA")} فقط` : "عروض منشأتك"} icon={Boxes} />
      <MetricCard label="طلبات واردة" value={`${openOrders.length}`} note="بانتظار الإكمال" icon={ShoppingBasket} tone="blue" />
      <MetricCard label="قيمة أحدث العروض" value={formatSar(stockValue)} note={listingCount > listings.length ? `محسوبة من أحدث ${listings.length.toLocaleString("ar-SA")} عرض` : "بسعر البيع الحالي"} icon={Store} tone="amber" />
    </section>

    <section id="external-sale" className="panel externalSalePanel"><div className="panelHeader"><div><span className="eyebrow"><ScanLine size={14} /> تحديث سريع للمخزون</span><h2>بيع خارجي سريع</h2></div></div><p className="panelLead">إذا بعت لعميل خارج تِجرا، امسح باركود المنتج وحدد الكمية. نخصمها فورًا من الكمية التي يراها التجار في السوق ونسجل اسم الموظف المنفذ.</p><SupplierExternalSaleForm listings={listingOptions} /></section>
    <section id="stock-audit" className="panel externalSalePanel" style={{ marginTop: 12 }}><div className="panelHeader"><div><span className="eyebrow"><ClipboardCheck size={14} /> جرد الموظفين</span><h2>جرد سريع للمخزون</h2></div></div><p className="panelLead">اختر الصنف وأدخل الكمية الفعلية بعد العد. يتم تعديل المخزون وتسجيل الموظف الذي جرد والفرق والوقت تلقائيًا.</p><SupplierInventoryAuditForm listings={listingOptions} /></section>

    <section className="marketSellerGrid">
      <article id="products" className="panel" style={{ padding: 20 }}><div className="panelHeader"><div><span className="eyebrow"><CirclePlus size={14} /> إضافة بضاعة</span><h2>انشر منتجًا في السوق</h2></div></div><p className="panelLead">اكتب اسم المنتج بوضوح مع الحجم والعبوة — مثل «بيبسي 330 مل × 24» — حتى يظهر بدقة في بحث التجار ومقارنة الأسعار.</p><MarketplaceListingForm /></article>
      <article id="orders" className="panel" style={{ padding: 20 }}><div className="panelHeader"><div><span className="eyebrow">الطلبات</span><h2>طلبات التجار</h2></div></div><div className="alertList">{orders.map((order) => <div className="marketOrderRow" key={order.id}><div><strong>{order.buyer.name}</strong><span>{order.items.map((item) => `${item.listing.name} × ${Number(item.quantity).toLocaleString("ar-SA")}`).join("، ")}</span>{order.status === "PLACED" && <MarketplaceOrderActions orderId={order.id} actions={["ACCEPT", "CANCEL"]} />}{order.status === "ACCEPTED" && <MarketplaceOrderActions orderId={order.id} actions={["CANCEL"]} />}</div><div className="alignEnd"><strong>{formatSar(Number(order.expectedTotal))}</strong><span>{statusLabels[order.status] ?? order.status}</span></div></div>)}{!orders.length && <div className="infoNote">لا توجد طلبات واردة حتى الآن.</div>}</div></article>
    </section>

    <section className="panel tablePanel" style={{ marginTop: 12 }}><div className="panelHeader tableHeader"><div><span className="eyebrow">مخزون المورد</span><h2>أحدث منتجاتك المعروضة</h2></div><span>{listings.length.toLocaleString("ar-SA")} من {listingCount.toLocaleString("ar-SA")}</span></div><div className="tableScroll"><table className="dataTable"><thead><tr><th>المنتج</th><th>السعر</th><th>المتوفر</th><th>الحد الأدنى</th><th>آخر تحديث</th><th>الحالة</th></tr></thead><tbody>{listings.map((item) => <tr key={item.id}><td><strong>{item.name}</strong>{item.barcode && <span className="mutedText" style={{ display: "block" }}>{item.barcode}</span>}</td><td>{formatSar(Number(item.price))}</td><td>{Number(item.quantity).toLocaleString("ar-SA")} {item.unit}</td><td>{Number(item.minOrderQty).toLocaleString("ar-SA")}</td><td><span className="stockUpdatedAt"><Clock3 size={13} /> {stockUpdateFormatter.format(item.updatedAt)}</span></td><td>{item.active ? "معروض" : "متوقف"}</td></tr>)}{!listings.length && <tr><td colSpan={6}><div className="infoNote">أضف أول منتج ليظهر في سوق تِجرا.</div></td></tr>}</tbody></table></div></section>

    <section className="panel tablePanel" style={{ marginTop: 12 }}><div className="panelHeader tableHeader"><div><span className="eyebrow"><UsersRound size={14} /> رقابة المخزون</span><h2>من جرد ومن أخرج البضاعة</h2></div></div><div className="tableScroll"><table className="dataTable"><thead><tr><th>العملية</th><th>الموظف</th><th>الصنف</th><th>الكمية</th><th>قبل ← بعد</th><th>الوقت</th></tr></thead><tbody>{auditEvents.map((event) => <tr key={event.id}><td><strong>{auditActionLabels[event.action] ?? event.action}</strong>{event.note && <span className="mutedText" style={{ display: "block" }}>{event.note}</span>}</td><td><strong>{event.actorName}</strong><span className="mutedText" style={{ display: "block" }}>{event.actorRole || "حساب منشأة"}</span></td><td>{event.itemName || "—"}</td><td>{event.quantity == null ? "—" : Number(event.quantity).toLocaleString("ar-SA")}</td><td>{event.previousQuantity == null || event.newQuantity == null ? "—" : `${Number(event.previousQuantity).toLocaleString("ar-SA")} ← ${Number(event.newQuantity).toLocaleString("ar-SA")}`}</td><td><span className="stockUpdatedAt"><Clock3 size={13} /> {stockUpdateFormatter.format(event.occurredAt)}</span></td></tr>)}{!auditEvents.length && <tr><td colSpan={6}><div className="infoNote">أول جرد أو إخراج بضاعة سيظهر هنا باسم الموظف المنفذ.</div></td></tr>}</tbody></table></div></section>

    <section id="customers" className="panel tablePanel" style={{ marginTop: 12 }}><div className="panelHeader tableHeader"><div><span className="eyebrow"><UsersRound size={14} /> التجار والعملاء</span><h2>أكثر التجار تعاملًا معك</h2></div></div><div className="tableScroll"><table className="dataTable"><thead><tr><th>التاجر</th><th>المدينة</th><th>عدد الطلبات</th><th>إجمالي الطلبات</th></tr></thead><tbody>{customers.map((customer) => <tr key={customer.id}><td><strong>{customer.name}</strong></td><td>{customer.city}</td><td>{customer.orders}</td><td>{formatSar(customer.total)}</td></tr>)}{!customers.length && <tr><td colSpan={4}><div className="infoNote">سيظهر هنا التجار بعد وصول أول طلبات لك.</div></td></tr>}</tbody></table></div></section>
  </>;
}
