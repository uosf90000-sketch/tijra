import { redirect } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";
import { ListingImporter } from "@/components/listing-importer";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "استيراد المنتجات" };
export const dynamic = "force-dynamic";

export default async function SupplierImportPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!["SUPPLIER", "BOTH"].includes(context.business.businessType)) redirect("/");
  const count = await db.marketplaceListing.count({ where: { sellerBusinessId: context.business.id } });
  return <><PageHeader eyebrow="المنتجات" title="استيراد المنتجات" description="بدل إضافة مئات الأصناف يدويًا: ارفع CSV أو انسخ الصفوف من Excel والصقها مباشرة." /><section className="metricsGrid"><MetricCard label="منتجاتك الحالية" value={`${count}`} note="في سوق تِجرا" icon={FileSpreadsheet} /></section><ListingImporter activity={context.business.businessActivity} /></>;
}
