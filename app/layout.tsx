import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { BRAND } from "@/lib/brand";
import { OfflineRuntime } from "@/components/offline-runtime";
import "./globals.css";
import "./premium.css";
import "./smart-price.css";
import "./command.css";
import "./marketplace.css";
import "./brand.css";
import "./showcase.css";
import "./barcode.css";
import "./retailer-gates.css";
import "./employee-access.css";
import "./approved-ui.css";
import "./statistics-dashboard.css";
import "./smart-workflows.css";
import "./recipe-pos.css";
import "./commerce-ops.css";
import "./navigation-cleanup.css";
import "./staff-workspace.css";
import "./simple-market.css";
import "./owner-six-door.css";
import "./smart-owner-home.css";
import "./executive-ui.css";
import "./offline.css";
import "./madaar-theme.css";

export const metadata: Metadata = {
  title: {
    default: BRAND.productName,
    template: `%s | ${BRAND.name}`,
  },
  description: BRAND.description,
  applicationName: BRAND.english,
};

export const viewport: Viewport = {
  themeColor: BRAND.colors.primary,
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <OfflineRuntime />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
