import Link from "next/link";
import { redirect } from "next/navigation";
import { CrmWorkspace } from "@/components/crm-workspace";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "العملاء وعروض الأسعار | تِجرا" };
export const dynamic = "force-dynamic";

export default async function CrmPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!["OWNER", "MANAGER", "ACCOUNTANT"].includes(context.membership.role))
    redirect("/no-access");
  const [customers, quotes] = await Promise.all([
    db.customer.findMany({
      where: { businessId: context.business.id },
      orderBy: { createdAt: "desc" }, take: 300,
    }),
    db.salesQuote.findMany({
      where: { businessId: context.business.id },
      include: { customer: { select: { name: true } }, lines: true },
      orderBy: { createdAt: "desc" }, take: 150,
    }),
  ]);
  return <>
    <PageHeader eyebrow="تِجرا 360" title="العملاء وعروض الأسعار"
      description="ابدأ من ملف العميل، جهّز العرض، ثم انتقل إلى متابعة المستحقات في نفس المنصة."
      actions={<Link href="/crm/receivables" className="button secondary">المستحقات والتحصيل</Link>} />
    <CrmWorkspace
      customers={customers.map((row) => ({
        id: row.id, name: row.name, customerType: row.customerType, phone: row.phone,
        creditLimit: row.creditLimit.toFixed(2), paymentTermsDays: row.paymentTermsDays,
      }))}
      quotes={quotes.map((row) => ({
        id: row.id, quoteNumber: row.quoteNumber, status: row.status,
        total: row.total.toFixed(2), expiresAt: row.expiresAt?.toISOString() || null,
        customer: row.customer,
        lines: row.lines.map((line) => ({
          id: line.id, description: line.description,
          quantity: line.quantity.toFixed(3), unitPrice: line.unitPrice.toFixed(2),
        })),
      }))}
      owner={context.membership.role === "OWNER"}
    />
  </>;
}
