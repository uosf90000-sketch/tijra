import { redirect } from "next/navigation";
import { Boxes, ScanBarcode } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { SupplierStockUpdateForm } from "@/components/supplier-stock-update-form";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "تحديث المخزون" };
export const dynamic = "force-dynamic";

export default async function SupplierStockUpdatePage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!["SUPPLIER", "BOTH"].includes(context.business.businessType)) redirect("/");
  const listings = await db.marketplaceListing.findMany({ where: { sellerBusinessId: context.business.id, active: true }, orderBy: { name: "asc" }, take: 1000 });
  const total = listings.reduce((sum, item) => sum + Number(item.quantity), 0);
  return <><PageHeader eyebrow="المخزون" title="تحديث باركود سريع" description="امسح المنتج واختر إدخال أو إخراج. كل حركة تحفظ باسم الموظف الذي نفذها." /><section className="metricsGrid two"><MetricCard label="الأصناف" value={`${listings.length}`} note="عروض فعالة" icon={Boxes} /><MetricCard label="إجمالي الوحدات" value={total.toLocaleString("ar-SA")} note="حسب وحدات العرض" icon={ScanBarcode} tone="blue" /></section><SupplierStockUpdateForm listings={listings.map((item) => ({ id: item.id, name: item.name, barcode: item.barcode, quantity: Number(item.quantity), unit: item.unit }))} /></>;
}
