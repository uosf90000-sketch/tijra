import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthenticatorSecurityForm } from "@/components/authenticator-security-form";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "أمان الحساب" };
export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  const user = await db.user.findUniqueOrThrow({
    where: { id: context.user.id }, select: { totpSecretEncrypted: true },
  });
  const available = Buffer.from(process.env.MFA_ENCRYPTION_KEY || "", "base64url").length === 32;

  return <>
    <PageHeader eyebrow="مدار وحماية الدخول" title="أمان حسابك"
      description="فعّل تطبيق المصادقة لإضافة رمز متغير بجانب كلمة المرور."
      actions={<Link href="/management/workspace" className="button secondary">العودة للشركات</Link>} />
    <AuthenticatorSecurityForm enabled={Boolean(user.totpSecretEncrypted)} available={available}/>
  </>;
}
