import { redirect } from "next/navigation";
import { BadgePercent, CircleDollarSign, Tags, TrendingDown } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";

export const metadata = { title: "ذكاء الأسعار للمورد" };
export const dynamic = "force-dynamic";

function normalize(value: string) {
  return value.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export default async function SupplierPriceIntelligencePage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!["SUPPLIER", "BOTH"].includes(context.business.businessType)) redirect("/");

  const [mine, market] = await Promise.all([
    db.marketplaceListing.findMany({ where: { sellerBusinessId: context.business.id, active: true }, orderBy: { name: "asc" }, take: 1000 }),
    db.marketplaceListing.findMany({ where: { sellerBusinessId: { not: context.business.id }, active: true, quantity: { gt: 0 } }, include: { seller: true }, orderBy: { price: "asc" }, take: 4000 }),
  ]);

  const rows = mine.map((listing) => {
    const key = normalize(listing.name);
    const matches = market.filter((candidate) => listing.barcode ? candidate.barcode === listing.barcode : normalize(candidate.name) === key && candidate.unit === listing.unit);
    if (!matches.length) return { listing, best: null, diff: 0, percent: 0 };
    const best = matches[0];
    const diff = Number(listing.price) - Number(best.price);
    const percent = Number(best.price) > 0 ? (diff / Number(best.price)) * 100 : 0;
    return { listing, best, diff, percent };
  });
  const above = rows.filter((row) => row.best && row.diff > 0.01).sort((a, b) => b.percent - a.percent);
  const competitive = rows.filter((row) => row.best && row.diff <= 0.01).length;
  const unmatched = rows.filter((row) => !row.best).length;
  const avgGap = above.length ? above.reduce((sum, row) => sum + row.percent, 0) / above.length : 0;

  return <><PageHeader eyebrow="التسعير" title="ذكاء الأسعار" description="تِجرا يقارن سعرك مع نفس المنتج والوحدة في السوق ويبين أين أنت أعلى من أفضل عرض، بدون خلط الأحجام أو العبوات." /><section className="metricsGrid four"><MetricCard label="أعلى من أفضل السوق" value={`${above.length}`} note="أصناف تحتاج مراجعة" icon={TrendingDown} /><MetricCard label="سعرك منافس" value={`${competitive}`} note="يساوي أو أقل من أفضل عرض" icon={BadgePercent} tone="blue" /><MetricCard label="لا توجد مقارنة" value={`${unmatched}`} note="لا يوجد منتج مطابق لدى غيرك" icon={Tags} tone="violet" /><MetricCard label="متوسط الفارق" value={`${Math.round(avgGap)}%`} note="للأصناف الأعلى فقط" icon={CircleDollarSign} tone="amber" /></section><section className="panel tablePanel workflowTable"><div className="panelHeader tableHeader"><div><span className="eyebrow">المقارنة</span><h2>الأصناف التي تحتاج مراجعة سعر</h2></div></div><div className="tableScroll"><table className="dataTable"><thead><tr><th>الصنف</th><th>سعرك</th><th>أفضل سعر بالسوق</th><th>الفارق</th><th>النسبة</th><th>أفضل مورد حالي</th></tr></thead><tbody>{above.map((row) => <tr key={row.listing.id}><td><strong>{row.listing.name}</strong><span className="mutedText" style={{ display: "block" }}>{row.listing.unit}</span></td><td>{formatSar(Number(row.listing.price))}</td><td>{row.best ? formatSar(Number(row.best.price)) : "—"}</td><td className="dangerText">+{formatSar(row.diff)}</td><td className="dangerText">+{Math.round(row.percent)}%</td><td>{row.best?.seller.name || "—"}</td></tr>)}{!above.length && <tr><td colSpan={6}><div className="infoNote">أسعارك المطابقة منافسة حاليًا أو لا توجد عروض مقارنة.</div></td></tr>}</tbody></table></div></section></>;
}
