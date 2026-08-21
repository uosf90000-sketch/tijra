import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import "./globals.css";
import "./premium.css";
import "./smart-price.css";
import "./command.css";
import "./marketplace.css";
import "./brand.css";
import "./showcase.css";

export const metadata: Metadata = {
  title: {
    default: "تِجرا | التجارة الذكية بين المورد والتاجر",
    template: "%s | تِجرا",
  },
  description: "منصة B2B عربية تربط الموردين بتجار التجزئة مع السوق الذكي وإدارة المخزون والمشتريات والمحاسبة والرواتب.",
  applicationName: "TIJRA",
};

export const viewport: Viewport = {
  themeColor: "#0F4D4D",
  colorScheme: "light",
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
