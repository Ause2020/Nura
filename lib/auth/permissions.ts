/**
 * Catálogo único de permisos. Deduce el comportamiento actual de Nura;
 * no inventa capacidades nuevas.
 *
 * Platform admin NO es un rol de organización: vive en
 * lib/access/platform-admin.ts (allowlist de email + service_role).
 */
import type { UserRole } from "@/types/database";

export const PERMISSIONS = {
  documents: {
    read: "documents.read",
    manage: "documents.manage",
    transitionRestricted: "documents.transitionRestricted",
  },
  haccp: {
    read: "haccp.read",
    manage: "haccp.manage",
    transitionRestricted: "haccp.transitionRestricted",
  },
  capa: {
    read: "capa.read",
    create: "capa.create",
    manage: "capa.manage",
    close: "capa.close",
  },
  audits: {
    read: "audits.read",
    manage: "audits.manage",
  },
  production: {
    read: "production.read",
    execute: "production.execute",
    manageTemplates: "production.manageTemplates",
  },
  monitoring: {
    read: "monitoring.read",
    execute: "monitoring.execute",
  },
  users: {
    manage: "users.manage",
  },
  settings: {
    manage: "settings.manage",
  },
  analysis: {
    read: "analysis.read",
  },
} as const;

type Values<T> = T[keyof T];
export type Permission = Values<{
  [K in keyof typeof PERMISSIONS]: Values<(typeof PERMISSIONS)[K]>;
}>;

const ALL_PERMISSIONS = Object.values(PERMISSIONS).flatMap((group) =>
  Object.values(group)
) as Permission[];

const QUALITY_MANAGER_DENIED = new Set<Permission>([
  PERMISSIONS.users.manage,
  PERMISSIONS.settings.manage,
  PERMISSIONS.documents.transitionRestricted,
  PERMISSIONS.haccp.transitionRestricted,
]);

const OPERATOR_ALLOWED = new Set<Permission>([
  PERMISSIONS.documents.read,
  PERMISSIONS.capa.create,
  PERMISSIONS.production.read,
  PERMISSIONS.production.execute,
  PERMISSIONS.monitoring.read,
  PERMISSIONS.monitoring.execute,
]);

const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  admin: new Set(ALL_PERMISSIONS),
  quality_manager: new Set(
    ALL_PERMISSIONS.filter((permission) => !QUALITY_MANAGER_DENIED.has(permission))
  ),
  operator: OPERATOR_ALLOWED,
};

export const ORG_ROLES: readonly UserRole[] = [
  "admin",
  "quality_manager",
  "operator",
];

export function isOrgRole(value: unknown): value is UserRole {
  return value === "admin" || value === "quality_manager" || value === "operator";
}

export function hasPermission(
  role: UserRole | string | null | undefined,
  permission: Permission
): boolean {
  if (!role || !isOrgRole(role)) return false;
  return ROLE_PERMISSIONS[role].has(permission);
}

/** admin + quality_manager — patrón canManage actual de módulos de calidad */
export function canManageQuality(role: UserRole | string | null | undefined): boolean {
  return hasPermission(role, PERMISSIONS.documents.manage);
}

export function permissionsForRole(role: UserRole): readonly Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}
