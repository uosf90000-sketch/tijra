import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "تِجرا | إدارة تجارتك بذكاء",
  description: "منصة ذكية لإدارة المخزون والموردين والمحاسبة والرواتب والمشتريات.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
