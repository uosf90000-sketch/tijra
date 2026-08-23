import type { ReactNode } from "react";
import { PermissionBoundary } from "@/components/permission-boundary";
export default function Layout({ children }: { children: ReactNode }) { return <PermissionBoundary anyOf={["CASHIER", "INVENTORY", "PURCHASES"]}>{children}</PermissionBoundary>; }
