import type { ReactNode } from "react";
import { PermissionBoundary } from "@/components/permission-boundary";

export default function SuppliersLayout({ children }: { children: ReactNode }) {
  return <PermissionBoundary permission="PURCHASES">{children}</PermissionBoundary>;
}
