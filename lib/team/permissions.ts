import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import {
  CORE_NAV_ITEMS,
  type CoreNavKey,
} from "@/lib/product/scope";
import type { UserRole } from "@/types/database";

const OPERATOR_ALLOWED_PREFIXES = [
  "/dashboard",
  "/planta",
  "/registros",
  "/documentos",
];

const OPERATOR_NAV_KEYS = new Set<CoreNavKey>([
  "dashboard",
  "documentos",
  "registros",
]);

const ADMIN_ONLY_PREFIXES = ["/configuracion", "/admin"];

export function canManageUsers(role: UserRole): boolean {
  return hasPermission(role, PERMISSIONS.users.manage);
}

export function canAccessPath(role: UserRole, pathname: string): boolean {
  if (role === "admin" || role === "quality_manager") return true;

  if (ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p))) {
    return false;
  }

  return OPERATOR_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function getNavItemsForRole(role: UserRole) {
  if (role === "operator") {
    return CORE_NAV_ITEMS.filter((item) => OPERATOR_NAV_KEYS.has(item.key));
  }

  return [...CORE_NAV_ITEMS];
}
