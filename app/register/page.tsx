import { redirect } from "next/navigation";

export const metadata = { title: "إنشاء حساب | تِجرا" };

export default function RegisterPage() {
  redirect("/login?mode=register");
}
