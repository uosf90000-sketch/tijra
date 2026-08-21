import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "تِجرا | إدارة تجارتك بذكاء",
    template: "%s | تِجرا",
  },
  description: "منصة عربية لإدارة المخزون والموردين والمشتريات والمحاسبة والموظفين والرواتب.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
