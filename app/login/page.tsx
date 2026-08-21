import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "تسجيل الدخول | تِجرا" };

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
