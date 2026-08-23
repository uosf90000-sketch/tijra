import { redirect } from "next/navigation";
import { StaffInventoryTerminal } from "@/components/staff-inventory-terminal";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "إدخال وإخراج المخزون" };
export const dynamic = "force-dynamic";

export default async function StaffInventoryPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (context.membership.role !== "STAFF" || !context.membership.permissions.includes("INVENTORY")) redirect("/");

  const products = await db.product.findMany({
    where: { businessId: context.business.id, active: true },
    select: { id: true, name: true, barcode: true, unit: true, quantity: true },
    orderBy: { name: "asc" },
    take: 3000,
  });

  return (
    <section className="staffTaskPage">
      <div className="staffPageIntro">
        <span>المخزون</span>
        <h1>امسح الصنف وسجّل الكمية</h1>
        <p>إدخال أو إخراج فقط. بقية تفاصيل المخزون تظهر في حساب المالك.</p>
      </div>
      <StaffInventoryTerminal products={products.map((item) => ({ ...item, quantity: Number(item.quantity) }))} />
    </section>
  );
}
