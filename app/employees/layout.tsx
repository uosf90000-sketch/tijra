import type { ReactNode } from "react";
import { PermissionBoundary } from "@/components/permission-boundary";

export default function EmployeesLayout({ children }: { children: ReactNode }) {
  return <PermissionBoundary adminOnly>{children}</PermissionBoundary>;
}
