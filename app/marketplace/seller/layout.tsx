import type { ReactNode } from "react";
import { PermissionBoundary } from "@/components/permission-boundary";

export default function MarketplaceSellerLayout({ children }: { children: ReactNode }) {
  return <PermissionBoundary permission="INVENTORY">{children}</PermissionBoundary>;
}
