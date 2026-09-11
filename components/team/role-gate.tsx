"use client";

import type { ReactNode } from "react";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import type { UserRole } from "@/types/database";

interface RoleGateProps {
  role: UserRole;
  allowed?: UserRole[];
  permission?: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}

export function RoleGate({
  role,
  allowed,
  permission,
  children,
  fallback = null,
}: RoleGateProps) {
  const permitted = permission
    ? hasPermission(role, permission)
    : allowed
      ? allowed.includes(role)
      : false;
  if (!permitted) return <>{fallback}</>;
  return <>{children}</>;
}
