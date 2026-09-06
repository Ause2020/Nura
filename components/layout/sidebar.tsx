"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Search,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CORE_NAV_LABELS, type CoreNavKey } from "@/lib/product/scope";
import { getNavItemsForRole } from "@/lib/team/permissions";
import { getRoleLabel } from "@/lib/team/constants";
import { useState } from "react";
import { CapaNavBadge } from "@/components/capa/capa-nav-badge";
import { NotificationBell } from "@/components/layout/notification-bell";
import type { UserRole } from "@/types/database";

const navIconMap: Record<CoreNavKey, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  analisis: BrainCircuit,
  documentos: FileText,
  registros: ClipboardList,
  haccp: ShieldCheck,
  auditorias: Search,
  capa: AlertTriangle,
};

const adminNavItem = {
  href: "/admin/acceso",
  label: "Acceso manual",
  icon: KeyRound,
};

const settingsNavItem = {
  href: "/configuracion",
  label: "Configuración",
  icon: Settings,
};

interface SidebarProps {
  organizationName?: string;
  userName?: string;
  userRole?: string;
  organizationId?: string | null;
  organizationLogoUrl?: string | null;
  userId?: string | null;
  isPlatformAdmin?: boolean;
}

export function Sidebar({
  organizationName = "Mi Empresa",
  userName = "Usuario",
  userRole = "Admin",
  organizationId = null,
  organizationLogoUrl = null,
  userId = null,
  isPlatformAdmin = false,
}: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const role = (userRole ?? "admin") as UserRole;

  const moduleNavItems = getNavItemsForRole(role).map((item) => ({
    ...item,
    label: CORE_NAV_LABELS[item.key],
    icon: navIconMap[item.key],
  }));

  const sidebarItems = [
    ...(isPlatformAdmin ? [adminNavItem] : []),
    ...moduleNavItems,
    ...(role === "admin" ? [settingsNavItem] : []),
  ];

  const handleLogout = async () => {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 flex flex-col bg-forest text-white transition-all duration-150",
        collapsed ? "w-14 md:w-14" : "w-14 md:w-56"
      )}
    >
      <div className="flex items-center justify-between px-3 h-14 border-b border-white/10">
        {!collapsed && (
          <Link
            href="/dashboard"
            className="hidden md:flex items-center gap-2 min-w-0"
          >
            {organizationLogoUrl ? (
              <Image
                src={organizationLogoUrl}
                alt={organizationName}
                width={96}
                height={28}
                className="h-7 w-auto max-w-[96px] object-contain"
                unoptimized
              />
            ) : (
              <span className="font-display text-lg font-semibold tracking-tight truncate">
                Nura
              </span>
            )}
          </Link>
        )}
        <span className={cn("font-display text-lg font-semibold md:hidden")}>
          {organizationLogoUrl ? (
            <Image
              src={organizationLogoUrl}
              alt={organizationName}
              width={24}
              height={24}
              className="h-6 w-6 object-contain"
              unoptimized
            />
          ) : (
            "N"
          )}
        </span>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="hidden md:flex h-7 w-7 items-center justify-center rounded-md hover:bg-white/10 transition-colors duration-150"
          aria-label={collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
        {userId && (
          <div className="md:hidden">
            <NotificationBell userId={userId} />
          </div>
        )}
      </div>

      {!collapsed && userId && (
        <div className="hidden md:flex items-center justify-end px-3 py-2 border-b border-white/10">
          <NotificationBell userId={userId} />
        </div>
      )}

      {!collapsed && (
        <div className="hidden md:block px-4 py-3 border-b border-white/10">
          <p className="text-xs text-white/60 uppercase tracking-wider font-mono">
            Empresa
          </p>
          <p className="text-sm font-medium truncate mt-0.5">{organizationName}</p>
        </div>
      )}

      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {sidebarItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={cn(
                "flex items-center gap-3 px-3 h-9 rounded-md text-sm transition-colors duration-150",
                isActive
                  ? "bg-sage-light text-forest font-medium border-l-2 border-forest"
                  : "text-white/80 hover:bg-white/10 hover:text-white border-l-2 border-transparent"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className={cn("truncate", collapsed ? "hidden" : "hidden md:inline")}>
                {label}
              </span>
              {href === "/capa" && organizationId && (
                <CapaNavBadge organizationId={organizationId} />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-2 py-4 border-t border-white/10">
        {!collapsed && (
          <div className="hidden md:block px-3 mb-3">
            <p className="text-sm font-medium truncate">{userName}</p>
            <p className="text-xs text-white/60">{getRoleLabel(role)}</p>
          </div>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 px-3 h-9 rounded-md text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors duration-150"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span className={cn(collapsed ? "hidden" : "hidden md:inline")}>
            Cerrar sesión
          </span>
        </button>
      </div>
    </aside>
  );
}
