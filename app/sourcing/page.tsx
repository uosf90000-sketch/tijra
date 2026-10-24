import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { SourcingWorkspace } from "@/components/sourcing-workspace";
import { hasAppPermission } from "@/lib/access";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "مقارنة الموردين وطلبات عروض الأسعار | تِجرا" };
export const dynamic = "force-dynamic";

export default async function SourcingPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!hasAppPermission(context.membership, "PURCHASES")) redirect("/no-access");
  const [products, suppliers, rfqs] = await Promise.all([
    db.product.findMany({
      where: { businessId: context.business.id, active: true },
      select: { id: true, name: true, unit: true },
      orderBy: { name: "asc" }, take: 500,
    }),
    db.supplier.findMany({
      where: { businessId: context.business.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" }, take: 300,
    }),
    db.sourcingRequest.findMany({
      where: { businessId: context.business.id },
      include: { product: { select: { name: true, unit: true } },
        bids: { include: { supplier: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" }, take: 100,
    }),
  ]);
  return <>
    <PageHeader eyebrow="تِجرا 360" title="المنافسة بين الموردين"
      description="اطلب تسعير احتياجك، قارن الأسعار، واعتمد المورد ثم أنشئ طلب شراء وفق حوكمة المنشأة."
      actions={<Link className="button secondary" href="/purchases">المشتريات</Link>} />
    <SourcingWorkspace
      products={products} suppliers={suppliers}
      reviewer={["OWNER", "MANAGER"].includes(context.membership.role)}
      requests={rfqs.map((row) => ({
        id: row.id, status: row.status, quantity: row.quantity.toFixed(3),
        quoteDeadline: row.quoteDeadline?.toISOString() || null,
        product: row.product,
        bids: row.bids.map((b) => ({
          id: b.id, supplierId: b.supplierId, unitPrice: b.unitPrice.toFixed(2),
          deliveryDays: b.deliveryDays, status: b.status, supplier: b.supplier,
        })),
      }))}
    />
  </>;
}
