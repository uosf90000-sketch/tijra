import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, Banknote, ReceiptText, TrendingUp } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { PosTerminal } from "@/components/pos-terminal";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";

export const metadata = { title: "المبيعات" };
export const dynamic = "force-dynamic";

const paymentLabels: Record<string, string> = { CASH: "نقدي", CARD: "بطاقة", TRANSFER: "تحويل", OTHER: "أخرى" };

export default async function SalesPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");

  const businessId = context.business.id;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [products, recentSales, todayAggregate] = await Promise.all([
    db.product.findMany({
      where: { businessId, active: true },
      select: { id: true, name: true, barcode: true, salePrice: true, quantity: true, unit: true },
      orderBy: { name: "asc" },
    }),
    db.sale.findMany({
      where: { businessId },
      include: { items: true },
      orderBy: { soldAt: "desc" },
      take: 30,
    }),
    db.sale.aggregate({
      where: { businessId, soldAt: { gte: today } },
      _sum: { total: true, costTotal: true },
      _count: { _all: true },
    }),
  ]);

  const salesTotal = Number(todayAggregate._sum.total ?? 0);
  const costTotal = Number(todayAggregate._sum.costTotal ?? 0);
  const grossProfit = salesTotal - costTotal;
  const count = todayAggregate._count._all;

  return (
    <>
      <PageHeader
        eyebrow="نقطة البيع"
        title="الكاشير"
        description="امسح الباركود وسجّل البيع؛ الكمية تخصم من المخزون ويُحفظ الموظف المنفّذ تلقائيًا."
        actions={<Link className="button secondary" href="/sales/analytics"><BarChart3 size={17} /> تحليلات المبيعات</Link>}
      />

      <section className="metricsGrid three">
        <MetricCard label="مبيعات اليوم" value={formatSar(salesTotal)} note={`${count} فواتير`} icon={TrendingUp} />
        <MetricCard label="مجمل الربح اليوم" value={formatSar(grossProfit)} note="بحسب متوسط التكلفة" icon={Banknote} tone="blue" />
        <MetricCard label="متوسط الفاتورة" value={formatSar(count ? salesTotal / count : 0)} note="لعمليات اليوم" icon={ReceiptText} tone="violet" />
      </section>

      <PosTerminal products={products.map((item) => ({
        id: item.id,
        name: item.name,
        barcode: item.barcode,
        salePrice: Number(item.salePrice),
        quantity: Number(item.quantity),
        unit: item.unit,
      }))} />

      <section className="panel tablePanel">
        <div className="panelHeader tableHeader"><div><span className="eyebrow">السجل</span><h2>آخر الفواتير</h2></div></div>
        <div className="tableScroll">
          <table className="dataTable">
            <thead><tr><th>الفاتورة</th><th>الوقت</th><th>عدد الأصناف</th><th>الإجمالي</th><th>التكلفة</th><th>الربح</th><th>الدفع</th></tr></thead>
            <tbody>
              {recentSales.map((sale) => (
                <tr key={sale.id}>
                  <td><strong>{sale.invoiceNumber || sale.id.slice(-8).toUpperCase()}</strong></td>
                  <td>{new Intl.DateTimeFormat("ar-SA", { dateStyle: "short", timeStyle: "short" }).format(sale.soldAt)}</td>
                  <td>{sale.items.length}</td>
                  <td>{formatSar(Number(sale.total))}</td>
                  <td>{formatSar(Number(sale.costTotal))}</td>
                  <td className="positive">{formatSar(Number(sale.total) - Number(sale.costTotal))}</td>
                  <td>{paymentLabels[sale.paymentMethod] ?? sale.paymentMethod}</td>
                </tr>
              ))}
              {!recentSales.length && <tr><td colSpan={7}><div className="infoNote">لا توجد مبيعات مسجلة بعد.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
