"use client";

import type { ReactNode } from "react";
import type { UserRole } from "@/types/database";

interface RoleGateProps {
  role: UserRole;
  allowed: UserRole[];
  children: ReactNode;
  fallback?: ReactNode;
}

export function RoleGate({
  role,
  allowed,
  children,
  fallback = null,
}: RoleGateProps) {
  if (!allowed.includes(role)) return <>{fallback}</>;
  return <>{children}</>;
}
