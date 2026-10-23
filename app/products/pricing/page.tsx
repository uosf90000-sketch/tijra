import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BadgePercent, ShieldCheck, Tags } from "lucide-react";
import { OwnerPriceApproval } from "@/components/owner-price-approval";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { firstPermissionHref } from "@/lib/access";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildMarginAlerts } from "@/lib/operating-intelligence";

export const metadata = { title: "مراجعة هوامش الربح وأسعار البيع" };
export const dynamic = "force-dynamic";

export default async function ProductPricingPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (context.membership.role !== "OWNER") redirect(firstPermissionHref(context.membership));
  const products = await db.product.findMany({
    where: { businessId: context.business.id, active: true, averageCost: { gt: 0 } },
    select: { id: true, name: true, salePrice: true, averageCost: true, quantity: true },
    orderBy: { name: "asc" },
    take: 2500,
  });
  const marginAlerts = buildMarginAlerts(products.map((item) => ({
    id: item.id,
    name: item.name,
    salePrice: Number(item.salePrice),
    averageCost: Number(item.averageCost),
    quantity: Number(item.quantity),
  })));
  const negative = marginAlerts.filter((item) => item.severity === "NEGATIVE").length;

  return <>
    <PageHeader
      eyebrow="المبيعات + المخزون + المشتريات"
      title="مراجعة الأسعار وهامش الربح"
      description="عند اعتماد فاتورة المورد، تتحدث تكلفة المخزون؛ هنا يظهر أثرها على سعر البيع المسجل. قرار التسعير دائمًا بيد المالك."
      actions={<Link className="button secondary" href="/purchases/insights"><ArrowRight size={17} /> مراقب المشتريات</Link>}
    />
    <section className="metricsGrid three">
      <MetricCard label="تحت حد الهامش المقترح" value={String(marginAlerts.length)} note="أقل من 15% هامش إجمالي تقريبي" icon={BadgePercent} tone="amber" />
      <MetricCard label="بلا هامش موجب" value={String(negative)} note="سعر البيع يساوي التكلفة أو أقل" icon={Tags} />
      <MetricCard label="فحص بعد الاستلام" value="تلقائي" note="حسب متوسط تكلفة المنتج الفعلية" icon={ShieldCheck} tone="blue" />
    </section>
    <div className="infoNote">
      هذه الأرقام تستخدم سعر البيع ومتوسط تكلفة المنتج فقط. لا تشمل ضريبة القيمة المضافة أو رسوم الدفع أو المصاريف أو تكلفة الوصفات، ولا تغير أسعار السوق أو القوائم الخارجية تلقائيًا.
      راجع سياسة تسعير منشأتك قبل الاعتماد. تشمل القائمة أول 2,500 صنف بتكلفة مسجلة.
    </div>
    <section style={{ display: "grid", gap: 16, marginTop: 16 }}>
      {marginAlerts.slice(0, 100).map((alert) => <OwnerPriceApproval key={alert.id} product={alert} />)}
      {!marginAlerts.length && <article className="panel"><div className="infoNote">
        لا توجد منتجات بهامش أقل من 15% بين الأصناف المفحوصة. المنتجات بلا تكلفة معلومة لا تدخل في الحساب.
      </div></article>}
    </section>
  </>;
}
