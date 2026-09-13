import {
  Building2,
  Bell,
  KeyRound,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface SettingsNavItem {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const SETTINGS_NAV: SettingsNavItem[] = [
  {
    href: "/configuracion/empresa",
    label: "Mi empresa",
    description: "Datos generales y logo",
    icon: Building2,
  },
  {
    href: "/configuracion/usuarios",
    label: "Usuarios y roles",
    description: "Equipo y permisos",
    icon: Users,
  },
  {
    href: "/configuracion/notificaciones",
    label: "Notificaciones",
    description: "Emails y alertas",
    icon: Bell,
  },
  {
    href: "/configuracion/acceso",
    label: "Acceso",
    description: "Estado de tu contrato",
    icon: KeyRound,
  },
];

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export const LOGO_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
