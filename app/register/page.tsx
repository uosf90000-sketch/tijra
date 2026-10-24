import { redirect } from "next/navigation";

export const metadata = { title: "إنشاء حساب | مدار" };

export default function RegisterPage() {
  redirect("/login?mode=register");
}
