import type { ReactNode } from "react";
import { PermissionBoundary } from "@/components/permission-boundary";

export default function SalesLayout({ children }: { children: ReactNode }) {
  return <PermissionBoundary permission="CASHIER">{children}</PermissionBoundary>;
}
