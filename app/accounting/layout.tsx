import type { ReactNode } from "react";
import { PermissionBoundary } from "@/components/permission-boundary";

export default function AccountingLayout({ children }: { children: ReactNode }) {
  return <PermissionBoundary permission="ACCOUNTING">{children}</PermissionBoundary>;
}
