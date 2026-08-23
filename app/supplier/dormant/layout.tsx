import type { ReactNode } from "react";
import { PermissionBoundary } from "@/components/permission-boundary";
export default function Layout({ children }: { children: ReactNode }) { return <PermissionBoundary permission="INVENTORY">{children}</PermissionBoundary>; }
