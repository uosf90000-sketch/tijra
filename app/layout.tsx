import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import "./globals.css";
import "./premium.css";
import "./smart-price.css";
import "./command.css";
import "./marketplace.css";

export const metadata: Metadata = {
  title: {
    default: "تِجرا | إدارة تجارتك بذكاء",
    template: "%s | تِجرا",
  },
  description: "سوق B2B عربي يربط الموردين بتجار التجزئة مع إدارة المخزون والمشتريات والمحاسبة.",
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
