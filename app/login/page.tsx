import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "الدخول إلى تِجرا" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const params = await searchParams;
  return <AuthForm initialMode={params.mode === "register" ? "register" : "login"} />;
}
