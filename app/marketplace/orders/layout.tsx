import type { ReactNode } from "react";
import { PermissionBoundary } from "@/components/permission-boundary";

export default function MarketplaceOrdersLayout({ children }: { children: ReactNode }) {
  return <PermissionBoundary permission="PURCHASES">{children}</PermissionBoundary>;
}
