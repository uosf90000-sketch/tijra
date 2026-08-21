import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SupplierPriceForm } from "@/components/supplier-price-form";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "تسجيل سعر مورد" };
export const dynamic = "force-dynamic";

export default async function NewSupplierPricePage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  const [suppliers, products] = await Promise.all([
    db.supplier.findMany({ where: { businessId: context.business.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.product.findMany({ where: { businessId: context.business.id, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="الموردون"
        title="تسجيل سعر مورد"
        description="اربط سعر الصنف بالمورد والحد الأدنى للطلب حتى تستخدمه المشتريات الذكية."
        actions={<Link className="button secondary" href="/suppliers"><ArrowRight size={17} /> رجوع للموردين</Link>}
      />
      <SupplierPriceForm suppliers={suppliers} products={products} />
    </>
  );
}
