"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Maximize2, RefreshCw, X } from "lucide-react";
import { filterKioskWidgets } from "@/lib/dashboard/kpi-widgets";
import type { DashboardData } from "@/lib/dashboard/data";
import { cn } from "@/lib/utils";

const REFRESH_KEY = "nura-kiosk-refresh-seconds";
const DEFAULT_REFRESH = 60;

interface PlantKioskViewProps {
  data: DashboardData;
  organizationName: string;
}

export function PlantKioskView({ data, organizationName }: PlantKioskViewProps) {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date());
  const [refreshSec, setRefreshSec] = useState(DEFAULT_REFRESH);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  useEffect(() => {
    const saved = Number(localStorage.getItem(REFRESH_KEY));
    if (!Number.isNaN(saved) && saved >= 15 && saved <= 300) {
      setRefreshSec(saved);
    }
  }, []);

  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      router.refresh();
      setLastRefresh(new Date());
    }, refreshSec * 1000);
    return () => clearInterval(timer);
  }, [router, refreshSec]);

  const widgets = filterKioskWidgets(data.moduleWidgets);
  const openTasks = data.tasks.filter((t) => t.urgent).length;

  function handleRefreshChange(value: string) {
    const n = Number(value);
    if (Number.isNaN(n) || n < 15 || n > 300) return;
    setRefreshSec(n);
    localStorage.setItem(REFRESH_KEY, String(n));
  }

  return (
    <div className="min-h-screen bg-[#0d2818] text-white flex flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-white/10">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-white/50">
            Nura · Pantalla de planta
          </p>
          <h1 className="text-xl font-semibold tracking-tight">
            {organizationName}
          </h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-3xl font-mono font-semibold tabular-nums">
              {now.toLocaleTimeString("es", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </p>
            <p className="text-xs text-white/50 font-mono">
              {now.toLocaleDateString("es", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-white/60">
            <RefreshCw className="h-3.5 w-3.5" />
            <select
              value={refreshSec}
              onChange={(e) => handleRefreshChange(e.target.value)}
              className="bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-xs"
            >
              <option value={30}>30s</option>
              <option value={60}>60s</option>
              <option value={120}>2 min</option>
              <option value={300}>5 min</option>
            </select>
          </div>
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-xs text-white/70 hover:text-white border border-white/20 rounded-md px-3 py-2"
          >
            <X className="h-3.5 w-3.5" />
            Salir
          </Link>
        </div>
      </header>

      <main className="flex-1 px-6 py-8 space-y-8">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {widgets.map((widget) => (
            <div
              key={widget.id}
              className={cn(
                "rounded-lg border-2 p-6 min-h-[160px] flex flex-col justify-between",
                widget.status === "success" && "border-[#40916C] bg-[#40916C]/10",
                widget.status === "warning" && "border-[#B7791F] bg-[#B7791F]/10",
                widget.status === "danger" && "border-[#DC2626] bg-[#DC2626]/10"
              )}
            >
              <p className="text-sm font-mono uppercase tracking-wider text-white/70">
                {widget.label}
              </p>
              <p
                className={cn(
                  "text-5xl xl:text-6xl font-mono font-bold my-3",
                  widget.status === "success" && "text-[#95D5B2]",
                  widget.status === "warning" && "text-[#F6E05E]",
                  widget.status === "danger" && "text-[#FCA5A5]"
                )}
              >
                {widget.value}
              </p>
              <p className="text-sm text-white/60 leading-snug">
                {widget.subtitle}
              </p>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div className="rounded-lg border border-white/15 bg-white/5 p-5">
            <p className="text-xs font-mono uppercase text-white/50">
              Score del sistema
            </p>
            <p className="text-4xl font-mono font-bold text-[#95D5B2] mt-2">
              {data.globalScore}%
            </p>
          </div>
          <div className="rounded-lg border border-white/15 bg-white/5 p-5">
            <p className="text-xs font-mono uppercase text-white/50">
              Tareas urgentes hoy
            </p>
            <p
              className={cn(
                "text-4xl font-mono font-bold mt-2",
                openTasks > 0 ? "text-[#FCA5A5]" : "text-[#95D5B2]"
              )}
            >
              {openTasks}
            </p>
          </div>
          <div className="rounded-lg border border-white/15 bg-white/5 p-5">
            <p className="text-xs font-mono uppercase text-white/50">
              Monitoreos conformes
            </p>
            <p className="text-4xl font-mono font-bold text-white mt-2">
              {data.recordsComplianceRate}%
            </p>
          </div>
        </div>
      </main>

      <footer className="px-6 py-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs text-white/40 font-mono">
        <span className="flex items-center gap-1.5">
          <Maximize2 className="h-3 w-3" />
          Modo kiosco — sin navegación
        </span>
        <span>
          Actualizado{" "}
          {lastRefresh.toLocaleTimeString("es", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </span>
      </footer>
    </div>
  );
}
