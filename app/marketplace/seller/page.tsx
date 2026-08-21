import Link from "next/link";
import { redirect } from "next/navigation";
import { Boxes, CirclePlus, ShoppingBasket, Store } from "lucide-react";
import { MarketplaceListingForm } from "@/components/marketplace-listing-form";
import { MarketplaceOrderActions } from "@/components/marketplace-order-actions";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";

export const metadata = { title: "لوحة المورد" };
export const dynamic = "force-dynamic";

const statusLabels: Record<string, string> = {
  PLACED: "طلب جديد",
  ACCEPTED: "تم القبول",
  RECEIVED: "استلمه التاجر",
  CANCELLED: "ملغي",
};

export default async function MarketplaceSellerPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!['SUPPLIER', 'BOTH'].includes(context.business.businessType)) redirect("/marketplace");

  const [listings, orders] = await Promise.all([
    db.marketplaceListing.findMany({ where: { sellerBusinessId: context.business.id }, orderBy: { updatedAt: "desc" }, take: 100 }),
    db.marketplaceOrder.findMany({
      where: { sellerBusinessId: context.business.id },
      include: { buyer: true, items: { include: { listing: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  const stockValue = listings.reduce((sum, item) => sum + Number(item.quantity) * Number(item.price), 0);
  const openOrders = orders.filter((order) => order.status === "PLACED" || order.status === "ACCEPTED");

  return (
    <>
      <PageHeader
        eyebrow="حساب المورد"
        title="متجرك في تِجرا"
        description="اعرض بضاعتك وأسعارك ومخزونك للتجار، واستقبل طلباتهم مباشرة داخل السوق."
        actions={<Link className="button secondary" href="/marketplace"><Store size={17} /> عرض السوق</Link>}
      />

      <section className="metricsGrid three">
        <MetricCard label="المنتجات المعروضة" value={`${listings.length}`} note="عروض منشأتك" icon={Boxes} />
        <MetricCard label="طلبات واردة" value={`${openOrders.length}`} note="بانتظار الإكمال" icon={ShoppingBasket} tone="blue" />
        <MetricCard label="قيمة مخزون العرض" value={formatSar(stockValue)} note="بسعر البيع الحالي" icon={Store} tone="amber" />
      </section>

      <section className="marketSellerGrid">
        <article className="panel" style={{ padding: 20 }}>
          <div className="panelHeader"><div><span className="eyebrow"><CirclePlus size={14} /> إضافة بضاعة</span><h2>انشر منتجًا في السوق</h2></div></div>
          <p className="panelLead">المنتج يظهر مباشرة لتجار التجزئة مع السعر والكمية والحد الأدنى للطلب.</p>
          <MarketplaceListingForm />
        </article>

        <article className="panel" style={{ padding: 20 }}>
          <div className="panelHeader"><div><span className="eyebrow">الطلبات</span><h2>طلبات التجار</h2></div></div>
          <div className="alertList">
            {orders.map((order) => (
              <div className="marketOrderRow" key={order.id}>
                <div>
                  <strong>{order.buyer.name}</strong>
                  <span>{order.items.map((item) => `${item.listing.name} × ${Number(item.quantity).toLocaleString("ar-SA")}`).join("، ")}</span>
                  {order.status === "PLACED" && <MarketplaceOrderActions orderId={order.id} actions={["ACCEPT", "CANCEL"]} />}
                  {order.status === "ACCEPTED" && <MarketplaceOrderActions orderId={order.id} actions={["CANCEL"]} />}
                </div>
                <div className="alignEnd"><strong>{formatSar(Number(order.expectedTotal))}</strong><span>{statusLabels[order.status] ?? order.status}</span></div>
              </div>
            ))}
            {!orders.length && <div className="infoNote">لا توجد طلبات واردة حتى الآن.</div>}
          </div>
        </article>
      </section>

      <section className="panel tablePanel" style={{ marginTop: 12 }}>
        <div className="panelHeader tableHeader"><div><span className="eyebrow">مخزون المورد</span><h2>منتجاتك المعروضة</h2></div></div>
        <div className="tableScroll"><table className="dataTable"><thead><tr><th>المنتج</th><th>السعر</th><th>المتوفر</th><th>الحد الأدنى</th><th>الحالة</th></tr></thead><tbody>
          {listings.map((item) => <tr key={item.id}><td><strong>{item.name}</strong></td><td>{formatSar(Number(item.price))}</td><td>{Number(item.quantity).toLocaleString("ar-SA")} {item.unit}</td><td>{Number(item.minOrderQty).toLocaleString("ar-SA")}</td><td>{item.active ? "معروض" : "متوقف"}</td></tr>)}
          {!listings.length && <tr><td colSpan={5}><div className="infoNote">أضف أول منتج ليظهر في سوق تِجرا.</div></td></tr>}
        </tbody></table></div>
      </section>
    </>
  );
}
