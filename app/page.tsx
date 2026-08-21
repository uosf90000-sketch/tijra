import Link from "next/link";
import {
  ArrowLeft,
  Boxes,
  CircleDollarSign,
  PackageSearch,
  ShoppingBasket,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  UsersRound,
} from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { ProgressBar } from "@/components/progress-bar";
import { StatusPill } from "@/components/status-pill";
import { inventoryProducts, purchaseSuggestions, weeklySales } from "@/lib/demo-data";
import { formatSar } from "@/lib/format";

const maxSales = Math.max(...weeklySales.map((item) => item.value));

export default function DashboardPage() {
  const stockValue = inventoryProducts.reduce((sum, item) => sum + item.quantity * item.averageCost, 0);
  const suggestedTotal = purchaseSuggestions.reduce((sum, item) => sum + item.suggested * item.unitPrice, 0);
  const totalSaving = purchaseSuggestions.reduce((sum, item) => sum + item.saving, 0);
  const lowItems = inventoryProducts.filter((item) => item.status !== "healthy");

  return (
    <>
      <PageHeader
        eyebrow="الخميس، 21 أغسطس 2026"
        title="مساء الخير 👋"
        description="هذه أهم الأشياء التي تحتاج انتباهك اليوم."
        actions={
          <Link className="button primary" href="/purchases">
            <Sparkles size={18} />
            جهّز مشتريات اليوم
          </Link>
        }
      />

      <section className="metricsGrid" aria-label="ملخص اليوم">
        <MetricCard label="مبيعات اليوم" value="4,820 ر.س" note="+8.4% عن أمس" trend="up" icon={TrendingUp} />
        <MetricCard label="الربح الإجمالي" value="1,146 ر.س" note="هامش 23.8%" trend="up" icon={CircleDollarSign} tone="blue" />
        <MetricCard label="قيمة المخزون" value={formatSar(stockValue)} note={`${inventoryProducts.length} أصناف تجريبية`} icon={Boxes} tone="violet" />
        <MetricCard label="مشتريات مقترحة" value={formatSar(suggestedTotal)} note={`${purchaseSuggestions.length} أصناف تحتاج طلب`} icon={ShoppingBasket} tone="amber" />
      </section>

      <section className="dashboardGrid">
        <article className="panel aiRecommendation">
          <div className="panelHeader">
            <div>
              <span className="eyebrow"><Sparkles size={14} /> اقتراح تِجرا</span>
              <h2>طلبية اليوم جاهزة للمراجعة</h2>
            </div>
            <div className="softIcon brand"><Sparkles size={21} /></div>
          </div>
          <p className="panelLead">
            حللنا سرعة البيع والكميات الحالية وأسعار الموردين المسجلة. نقترح شراء {purchaseSuggestions.length} أصناف
            بقيمة تقريبية {formatSar(suggestedTotal)}.
          </p>

          <div className="savingCallout">
            <div>
              <span>التوفير المتوقع مقارنة بآخر سعر شراء</span>
              <strong>{formatSar(totalSaving)}</strong>
            </div>
            <span className="savingBadge">توفير ذكي</span>
          </div>

          <div className="suggestionPreview">
            {purchaseSuggestions.slice(0, 3).map((item) => (
              <div className="suggestionRow" key={item.product}>
                <div className="productDot" />
                <div className="grow">
                  <strong>{item.product}</strong>
                  <span>{item.supplier}</span>
                </div>
                <div className="alignEnd">
                  <strong>{item.suggested} {item.unit}</strong>
                  <span>{formatSar(item.suggested * item.unitPrice)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="panelActions">
            <Link className="button primary" href="/purchases">مراجعة الطلبية</Link>
            <Link className="button secondary" href="/suppliers">مقارنة الموردين</Link>
          </div>
        </article>

        <article className="panel">
          <div className="panelHeader">
            <div>
              <span className="eyebrow amber"><TriangleAlert size={14} /> تنبيه المخزون</span>
              <h2>أصناف ستنفد قريبًا</h2>
            </div>
            <Link className="textLink" href="/inventory">عرض الكل <ArrowLeft size={15} /></Link>
          </div>

          <div className="alertList">
            {lowItems.map((item) => {
              const coverage = item.avgDailySales > 0 ? item.quantity / item.avgDailySales : 99;
              return (
                <div className="alertRow" key={item.id}>
                  <div className="grow">
                    <div className="rowTitle">
                      <strong>{item.name}</strong>
                      <StatusPill status={item.status} />
                    </div>
                    <span>{item.quantity} {item.unit} · يغطي قرابة {Math.max(1, Math.round(coverage))} يوم</span>
                    <ProgressBar
                      value={item.quantity}
                      max={Math.max(item.reorderPoint * 2, item.quantity)}
                      tone={item.status === "critical" ? "red" : "amber"}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      <section className="dashboardGrid lower">
        <article className="panel chartPanel">
          <div className="panelHeader">
            <div>
              <span className="eyebrow">آخر 7 أيام</span>
              <h2>اتجاه المبيعات</h2>
            </div>
            <div className="miniSummary">
              <strong>29,470 ر.س</strong>
              <span>إجمالي الأسبوع</span>
            </div>
          </div>

          <div className="barChart" aria-label="مبيعات آخر سبعة أيام">
            {weeklySales.map((item) => (
              <div className="barColumn" key={item.day}>
                <span className="barValue">{Math.round(item.value / 100) / 10}k</span>
                <div className="barTrack">
                  <div className="bar" style={{ height: `${Math.max(16, (item.value / maxSales) * 100)}%` }} />
                </div>
                <span>{item.day}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panelHeader">
            <div>
              <span className="eyebrow violet"><UsersRound size={14} /> الرواتب</span>
              <h2>مسير أغسطس</h2>
            </div>
            <StatusPill status="draft" />
          </div>

          <div className="payrollSnapshot">
            <div>
              <span>صافي الرواتب المتوقع</span>
              <strong>17,955 ر.س</strong>
            </div>
            <div>
              <span>الموظفون</span>
              <strong>4</strong>
            </div>
            <div>
              <span>خصومات وسلف</span>
              <strong>595 ر.س</strong>
            </div>
          </div>

          <div className="noticeBox">
            <PackageSearch size={18} />
            <div>
              <strong>لا يوجد تعارض</strong>
              <span>المسير جاهز للمراجعة قبل الاعتماد.</span>
            </div>
          </div>

          <Link className="button secondary full" href="/payroll">فتح مسير الرواتب</Link>
        </article>
      </section>
    </>
  );
}
