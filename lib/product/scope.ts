/**
 * Superficie de producto: Nura como sistema de inocuidad / HACCP.
 * Los módulos fuera del núcleo se ocultan (rutas redirigen) pero el código
 * y las tablas se conservan por si se reactivan.
 */

export const CORE_NAV_ITEMS = [
  { href: "/dashboard", key: "dashboard" },
  { href: "/analisis", key: "analisis" },
  { href: "/documentos", key: "documentos" },
  { href: "/haccp", key: "haccp" },
  { href: "/registros", key: "registros" },
  { href: "/auditorias", key: "auditorias" },
  { href: "/capa", key: "capa" },
] as const;

export type CoreNavKey = (typeof CORE_NAV_ITEMS)[number]["key"];

export const CORE_NAV_LABELS: Record<CoreNavKey, string> = {
  dashboard: "Dashboard",
  analisis: "Análisis",
  documentos: "Documentos",
  haccp: "Plan HACCP",
  registros: "Monitoreo",
  auditorias: "Auditorías",
  capa: "No Conformidades",
};

export const HIDDEN_MODULE_PREFIXES = [
  "/proveedores",
  "/proveedor",
  "/capacitacion",
  "/reclamos",
  "/trazabilidad",
] as const;

export function isHiddenModulePath(pathname: string): boolean {
  return HIDDEN_MODULE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
