import type { ReactNode } from "react";
import { PermissionBoundary } from "@/components/permission-boundary";

export default function RecipesLayout({ children }: { children: ReactNode }) {
  return <PermissionBoundary permission="INVENTORY">{children}</PermissionBoundary>;
}
