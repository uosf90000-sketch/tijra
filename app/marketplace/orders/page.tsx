import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, PackageCheck, ShoppingBag } from "lucide-react";
import { MarketplaceOrderActions } from "@/components/marketplace-order-actions";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";

export const metadata = { title: "طلباتي من السوق" };
export const dynamic = "force-dynamic";

const statusLabels: Record<string, string> = {
  PLACED: "مرسل للمورد",
  ACCEPTED: "قبله المورد",
  RECEIVED: "تم الاستلام",
  CANCELLED: "ملغي",
};

export default async function MarketplaceOrdersPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");

  const orders = await db.marketplaceOrder.findMany({
    where: { buyerBusinessId: context.business.id },
    include: { seller: true, items: { include: { listing: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const active = orders.filter((order) => order.status === "PLACED" || order.status === "ACCEPTED");
  const received = orders.filter((order) => order.status === "RECEIVED");
  const total = received.reduce((sum, order) => sum + Number(order.expectedTotal), 0);

  return (
    <>
      <PageHeader
        eyebrow="مشتريات السوق"
        title="طلباتي"
        description="تابع طلباتك من الموردين. عند تأكيد الاستلام تدخل الكمية مباشرة إلى مخزون منشأتك ومتوسط التكلفة."
        actions={<Link className="button primary" href="/marketplace"><ShoppingBag size={17} /> متابعة التسوق</Link>}
      />

      <section className="metricsGrid three">
        <MetricCard label="طلبات نشطة" value={`${active.length}`} note="مرسلة أو مقبولة" icon={ShoppingBag} />
        <MetricCard label="طلبات مستلمة" value={`${received.length}`} note="دخلت المخزون" icon={PackageCheck} tone="blue" />
        <MetricCard label="قيمة المستلم" value={formatSar(total)} note="تكلفة بضاعة مستلمة" icon={PackageCheck} tone="amber" />
      </section>

      <section className="panel tablePanel">
        <div className="panelHeader tableHeader"><div><span className="eyebrow">السجل</span><h2>طلبات سوق تِجرا</h2></div></div>
        <div className="tableScroll">
          <table className="dataTable">
            <thead><tr><th>المورد</th><th>المنتجات</th><th>الإجمالي</th><th>الحالة</th><th>الإجراء</th></tr></thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td><strong>{order.seller.name}</strong></td>
                  <td>{order.items.map((item) => `${item.listing.name} × ${Number(item.quantity).toLocaleString("ar-SA")}`).join("، ")}</td>
                  <td>{formatSar(Number(order.expectedTotal))}</td>
                  <td>{statusLabels[order.status] ?? order.status}</td>
                  <td>
                    {order.status === "ACCEPTED" ? <MarketplaceOrderActions orderId={order.id} actions={["RECEIVE", "CANCEL"]} /> : order.status === "PLACED" ? <MarketplaceOrderActions orderId={order.id} actions={["CANCEL"]} /> : <span className="marketNotice">—</span>}
                  </td>
                </tr>
              ))}
              {!orders.length && <tr><td colSpan={5}><div className="infoNote">ما عندك طلبات من السوق حتى الآن. <Link className="textLink" href="/marketplace">اذهب للسوق <ArrowLeft size={14} /></Link></div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
