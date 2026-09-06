import type { UserRole } from "@/types/database";

export const MAX_TEAM_USERS = 10;

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  quality_manager: "Jefe de calidad",
  operator: "Operador",
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: "Acceso total, gestiona usuarios y configuración",
  quality_manager: "Acceso a todos los módulos, sin gestión de usuarios",
  operator: "Ejecuta registros y consulta tareas asignadas",
};

export const INVITABLE_ROLES: UserRole[] = [
  "quality_manager",
  "operator",
  "admin",
];

export function getRoleLabel(role: UserRole): string {
  return ROLE_LABELS[role] ?? role;
}
