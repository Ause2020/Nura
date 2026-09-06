"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Search,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const AUTOPLAY_MS = 5500;

type ModuleKey = "dashboard" | "haccp" | "registros" | "capa" | "auditorias";

interface SlideMeta {
  id: ModuleKey;
  navLabel: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
}

const SLIDES: SlideMeta[] = [
  {
    id: "dashboard",
    navLabel: "Dashboard",
    title: "Dashboard",
    subtitle: "Estado del sistema de inocuidad",
    icon: LayoutDashboard,
  },
  {
    id: "haccp",
    navLabel: "Plan HACCP",
    title: "Plan HACCP",
    subtitle: "Árbol de decisiones y CCPs",
    icon: ShieldCheck,
  },
  {
    id: "registros",
    navLabel: "Monitoreo",
    title: "Monitoreo de PCC",
    subtitle: "Autocontroles en planta",
    icon: ClipboardList,
  },
  {
    id: "capa",
    navLabel: "No Conformidades",
    title: "No Conformidades · CAPA",
    subtitle: "Severidad y avance de acciones",
    icon: AlertTriangle,
  },
  {
    id: "auditorias",
    navLabel: "Auditorías",
    title: "Auditorías internas",
    subtitle: "Checklist y conformidad",
    icon: Search,
  },
];

const NAV: { key: ModuleKey | "documentos"; label: string; icon: LucideIcon; badge?: number }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "documentos", label: "Documentos", icon: FileText },
  { key: "haccp", label: "Plan HACCP", icon: ShieldCheck },
  { key: "registros", label: "Monitoreo", icon: ClipboardList },
  { key: "auditorias", label: "Auditorías", icon: Search },
  { key: "capa", label: "No Conformidades", icon: AlertTriangle, badge: 2 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Shared chrome (sidebar + frame). Right panel content swaps per slide.
// ─────────────────────────────────────────────────────────────────────────────

function PreviewSidebar({ active }: { active: ModuleKey }) {
  return (
    <aside className="hidden sm:flex w-[148px] shrink-0 flex-col bg-forest text-white">
      <div className="px-4 h-12 flex items-center border-b border-white/10">
        <span className="font-display text-sm font-semibold tracking-tight">
          Nura.
        </span>
      </div>
      <div className="px-3 py-2 border-b border-white/10">
        <p className="text-[9px] text-white/50 uppercase tracking-wider font-mono">
          Empresa
        </p>
        <p className="text-[11px] font-medium truncate mt-0.5">Lácteos del Sur</p>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV.map((item) => {
          const isActive = item.key === active;
          return (
            <div
              key={item.key}
              className={cn(
                "flex items-center gap-2 px-2.5 h-8 rounded-md text-[11px] transition-colors duration-300",
                isActive
                  ? "bg-sage-light/90 text-forest font-medium nura-nav-active"
                  : "text-white/75"
              )}
            >
              <item.icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{item.label}</span>
              {item.badge && (
                <span className="ml-auto text-[9px] font-mono bg-danger/90 text-white px-1.5 rounded-full">
                  {item.badge}
                </span>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

function PanelHeader({
  title,
  subtitle,
  icon: Icon,
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
}) {
  return (
    <div className="px-4 py-3 border-b border-border bg-white flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-ink truncate">{title}</p>
        <p className="text-[10px] text-ink-faint truncate">{subtitle}</p>
      </div>
      <span className="shrink-0 h-7 w-7 rounded-md bg-sage-light/60 text-forest flex items-center justify-center">
        <Icon className="h-3.5 w-3.5" />
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-module panel content
// ─────────────────────────────────────────────────────────────────────────────

function DashboardPanel() {
  const KPIS = [
    { label: "Cumplimiento global", value: "98.4%", tone: "sage" },
    { label: "CCPs activos", value: "CCP-01", tone: "forest" },
    { label: "NC abiertas", value: "3", tone: "amber" },
    { label: "Última auditoría", value: "94%", tone: "mono" },
  ];
  const TASKS = [
    { text: "Completar monitoreo CCP-01 — lote 2026-042", time: "Hoy" },
    { text: "Verificar registro CCP-01 cocción", time: "14:00" },
    { text: "Cerrar acción CAPA de NC-2026-004", time: "Vence mañana" },
  ];
  return (
    <div className="flex-1 overflow-hidden p-4 space-y-3">
      <div className="nura-stagger" style={{ animationDelay: "0.3s" }}>
        <p className="text-xs font-semibold text-ink">Buenos días, Laura.</p>
        <p className="text-[10px] text-ink-faint mt-0.5">
          Tienes <span className="font-mono text-ink-light">3</span> tareas
          pendientes hoy.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {KPIS.map((kpi, i) => (
          <div
            key={kpi.label}
            className="bg-white border border-border rounded-md px-2.5 py-2 nura-kpi-pop"
            style={{ animationDelay: `${0.4 + i * 0.12}s` }}
          >
            <p className="text-[9px] text-ink-faint uppercase tracking-wider font-mono truncate">
              {kpi.label}
            </p>
            <p
              className={cn(
                "text-sm font-semibold mt-0.5 truncate",
                kpi.tone === "sage" && "text-sage",
                kpi.tone === "forest" && "text-forest font-mono text-xs",
                kpi.tone === "amber" && "text-amber",
                kpi.tone === "mono" && "text-ink font-mono text-[11px]"
              )}
            >
              {kpi.value}
            </p>
          </div>
        ))}
      </div>
      <div className="bg-white border border-border rounded-md p-2.5 space-y-1.5">
        <p className="text-[9px] font-mono uppercase tracking-wider text-ink-light">
          Hoy
        </p>
        {TASKS.map((task, i) => (
          <div
            key={task.text}
            className="flex items-start justify-between gap-2 text-[10px] nura-task-slide"
            style={{ animationDelay: `${0.8 + i * 0.1}s` }}
          >
            <span className="text-ink-light leading-snug">{task.text}</span>
            <span className="font-mono text-ink-faint shrink-0">{task.time}</span>
          </div>
        ))}
      </div>
      <div className="flex items-end gap-1 h-12 px-1">
        {[42, 68, 55, 82, 74, 91, 88].map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm bg-sage/30 nura-bar-grow origin-bottom"
            style={{ height: `${h}%`, animationDelay: `${1.1 + i * 0.06}s` }}
          />
        ))}
      </div>
    </div>
  );
}

function HaccpPanel() {
  const STEPS = [
    { label: "Recepción", ccp: false },
    { label: "Almacenado", ccp: false },
    { label: "Cocción", ccp: true },
    { label: "Enfriado", ccp: false },
    { label: "Envasado", ccp: false },
  ];
  return (
    <div className="flex-1 overflow-hidden p-4 space-y-3">
      <div className="nura-stagger" style={{ animationDelay: "0.3s" }}>
        <p className="text-xs font-semibold text-ink">Diagrama de flujo</p>
        <p className="text-[10px] text-ink-faint mt-0.5">
          Leche pasteurizada — 5 etapas, 1 CCP
        </p>
      </div>
      <div className="flex items-stretch gap-1">
        {STEPS.map((step, i) => (
          <div key={step.label} className="flex items-center gap-1 min-w-0">
            <div
              className={cn(
                "rounded-md border px-1.5 py-2 text-center min-w-0 nura-kpi-pop",
                step.ccp
                  ? "bg-sage text-white border-sage shadow-[0_0_18px_-4px_rgba(64,145,108,0.8)]"
                  : "bg-white border-border text-ink-light"
              )}
              style={{ animationDelay: `${0.4 + i * 0.12}s` }}
            >
              {step.ccp && (
                <span className="block text-[8px] font-mono font-bold tracking-wider">
                  CCP-01
                </span>
              )}
              <span className="block text-[9px] font-medium leading-tight truncate">
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span className="h-px w-2 bg-border shrink-0" />
            )}
          </div>
        ))}
      </div>
      <div className="bg-white border border-border rounded-md p-2.5 space-y-1.5">
        <p className="text-[9px] font-mono uppercase tracking-wider text-ink-light">
          Matriz de control — CCP-01
        </p>
        {[
          { k: "Límite crítico", v: "≥ 72 °C / 15 s" },
          { k: "Monitoreo", v: "Continuo · registrador" },
          { k: "Acción correctiva", v: "Re-proceso lote" },
        ].map((row, i) => (
          <div
            key={row.k}
            className="flex items-center justify-between gap-2 text-[10px] nura-task-slide"
            style={{ animationDelay: `${0.8 + i * 0.1}s` }}
          >
            <span className="text-ink-faint">{row.k}</span>
            <span className="font-mono text-ink-light truncate">{row.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RegistrosPanel() {
  const ROWS = [
    { code: "REG-2026-042", name: "Control de cocción", time: "08:14", ok: true },
    { code: "REG-2026-041", name: "Temperatura cámara", time: "07:50", ok: true },
    { code: "REG-2026-040", name: "Limpieza CIP línea 2", time: "06:30", ok: false },
    { code: "REG-2026-039", name: "Recepción materia prima", time: "05:55", ok: true },
  ];
  return (
    <div className="flex-1 overflow-hidden p-4 space-y-3">
      <div className="nura-stagger" style={{ animationDelay: "0.3s" }}>
        <p className="text-xs font-semibold text-ink">Monitoreos de hoy</p>
        <p className="text-[10px] text-ink-faint mt-0.5">
          <span className="font-mono text-sage">12</span> completados ·{" "}
          <span className="font-mono text-amber">1</span> con desviación
        </p>
      </div>
      <div className="bg-white border border-border rounded-md overflow-hidden">
        {ROWS.map((row, i) => (
          <div
            key={row.code}
            className="flex items-center gap-2 px-2.5 py-2 border-b border-border last:border-0 text-[10px] nura-task-slide"
            style={{ animationDelay: `${0.4 + i * 0.1}s` }}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full shrink-0",
                row.ok ? "bg-sage" : "bg-amber"
              )}
            />
            <span className="font-mono text-ink-faint shrink-0">{row.code}</span>
            <span className="text-ink-light truncate flex-1">{row.name}</span>
            <span className="font-mono text-ink-faint shrink-0">{row.time}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 px-1">
        {[1, 2, 3, 4, 5, 6].map((n, i) => (
          <div key={n} className="flex items-center gap-1.5 flex-1 min-w-0">
            <span
              className={cn(
                "h-2 w-2 rounded-full shrink-0 nura-kpi-pop",
                i < 4 ? "bg-sage" : "bg-border"
              )}
              style={{ animationDelay: `${0.8 + i * 0.08}s` }}
            />
            {n < 6 && (
              <span
                className={cn(
                  "h-px flex-1",
                  i < 3 ? "bg-sage/50" : "bg-border"
                )}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CapaPanel() {
  const MATRIX = [
    { sev: "Crítica", tone: "danger", count: 1 },
    { sev: "Mayor", tone: "amber", count: 2 },
    { sev: "Menor", tone: "sage", count: 4 },
  ];
  const ACTIONS = [
    { code: "NC-2026-004", pct: 80 },
    { code: "NC-2026-003", pct: 45 },
    { code: "NC-2026-002", pct: 100 },
  ];
  return (
    <div className="flex-1 overflow-hidden p-4 space-y-3">
      <div className="nura-stagger" style={{ animationDelay: "0.3s" }}>
        <p className="text-xs font-semibold text-ink">No conformidades abiertas</p>
        <p className="text-[10px] text-ink-faint mt-0.5">
          Por severidad — semana en curso
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {MATRIX.map((m, i) => (
          <div
            key={m.sev}
            className="bg-white border border-border rounded-md px-2 py-2 text-center nura-kpi-pop"
            style={{ animationDelay: `${0.4 + i * 0.12}s` }}
          >
            <p
              className={cn(
                "text-base font-mono font-bold leading-none",
                m.tone === "danger" && "text-danger",
                m.tone === "amber" && "text-amber",
                m.tone === "sage" && "text-sage"
              )}
            >
              {m.count}
            </p>
            <span
              className={cn(
                "inline-block mt-1 text-[8px] font-medium px-1.5 py-0.5 rounded-full",
                m.tone === "danger" && "bg-danger/10 text-danger",
                m.tone === "amber" && "bg-amber/10 text-amber",
                m.tone === "sage" && "bg-sage/10 text-sage"
              )}
            >
              {m.sev}
            </span>
          </div>
        ))}
      </div>
      <div className="bg-white border border-border rounded-md p-2.5 space-y-2">
        <p className="text-[9px] font-mono uppercase tracking-wider text-ink-light">
          Avance de acciones CAPA
        </p>
        {ACTIONS.map((a, i) => (
          <div key={a.code} className="space-y-1">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-mono text-ink-faint">{a.code}</span>
              <span className="font-mono text-ink-light">{a.pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-background overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full origin-left nura-bar-grow-x",
                  a.pct === 100 ? "bg-sage" : "bg-forest"
                )}
                style={{ width: `${a.pct}%`, animationDelay: `${0.7 + i * 0.12}s` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditoriasPanel() {
  const CHECKS = [
    { text: "Higiene del personal", ok: true },
    { text: "Control de plagas", ok: true },
    { text: "Trazabilidad de lotes", ok: true },
    { text: "Calibración de equipos", ok: false },
    { text: "Registros de limpieza", ok: true },
    { text: "Gestión de alérgenos", ok: true },
  ];
  return (
    <div className="flex-1 overflow-hidden p-4 space-y-3">
      <div
        className="flex items-center justify-between nura-stagger"
        style={{ animationDelay: "0.3s" }}
      >
        <div>
          <p className="text-xs font-semibold text-ink">Auditoría BRCGS</p>
          <p className="text-[10px] text-ink-faint mt-0.5">Línea de pasteurizado</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-mono font-bold text-sage leading-none">94%</p>
          <p className="text-[8px] text-ink-faint font-mono uppercase tracking-wider">
            Conformidad
          </p>
        </div>
      </div>
      <div className="bg-white border border-border rounded-md p-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {CHECKS.map((c, i) => (
          <div
            key={c.text}
            className="flex items-center gap-1.5 text-[10px] nura-task-slide"
            style={{ animationDelay: `${0.4 + i * 0.08}s` }}
          >
            <span
              className={cn(
                "h-3 w-3 rounded-full shrink-0 flex items-center justify-center text-[8px] font-bold",
                c.ok ? "bg-sage text-white" : "bg-amber/20 text-amber border border-amber/40"
              )}
            >
              {c.ok ? "✓" : "!"}
            </span>
            <span className="text-ink-light truncate">{c.text}</span>
          </div>
        ))}
      </div>
      <div className="bg-white border border-border rounded-md p-2.5 space-y-2">
        {[
          { sec: "Prerrequisitos", pct: 96 },
          { sec: "Plan HACCP", pct: 92 },
          { sec: "Documentación", pct: 88 },
        ].map((s, i) => (
          <div key={s.sec} className="space-y-1">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-ink-faint">{s.sec}</span>
              <span className="font-mono text-ink-light">{s.pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-background overflow-hidden">
              <div
                className="h-full rounded-full bg-sage origin-left nura-bar-grow-x"
                style={{ width: `${s.pct}%`, animationDelay: `${0.7 + i * 0.12}s` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelContent({ id }: { id: ModuleKey }) {
  switch (id) {
    case "dashboard":
      return <DashboardPanel />;
    case "haccp":
      return <HaccpPanel />;
    case "registros":
      return <RegistrosPanel />;
    case "capa":
      return <CapaPanel />;
    case "auditorias":
      return <AuditoriasPanel />;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Carousel shell
// ─────────────────────────────────────────────────────────────────────────────

export function ModuleCarousel() {
  const [current, setCurrent] = useState(0);
  const [visible, setVisible] = useState(true);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const transitioningRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const goTo = useCallback(
    (index: number) => {
      const next = (index + SLIDES.length) % SLIDES.length;
      if (next === current || transitioningRef.current) return;

      if (reducedMotion) {
        setCurrent(next);
        return;
      }

      transitioningRef.current = true;
      setVisible(false); // fade-out (200ms)
      window.setTimeout(() => {
        setCurrent(next);
        setVisible(true); // fade-in (300ms)
        transitioningRef.current = false;
      }, 200);
    },
    [current, reducedMotion]
  );

  // Autoplay
  useEffect(() => {
    if (paused || reducedMotion) return;
    const timer = window.setInterval(() => {
      goTo(current + 1);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [current, paused, reducedMotion, goTo]);

  const slide = SLIDES[current];

  return (
    <div
      className="nura-preview-float relative w-full max-w-[640px] mx-auto"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      role="group"
      aria-roledescription="carrusel"
      aria-label="Vista previa de los módulos de Nura"
    >
      <div
        className="absolute -inset-4 rounded-2xl bg-sage/20 blur-2xl nura-orb-pulse"
        aria-hidden="true"
      />

      {/* Prev / Next — desktop only */}
      <button
        type="button"
        onClick={() => goTo(current - 1)}
        aria-label="Módulo anterior"
        className="hidden lg:flex absolute -left-4 top-1/2 -translate-y-1/2 z-10 h-8 w-8 items-center justify-center rounded-full bg-white/10 border border-white/15 text-white/70 backdrop-blur-sm hover:bg-white/20 hover:text-white transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => goTo(current + 1)}
        aria-label="Módulo siguiente"
        className="hidden lg:flex absolute -right-4 top-1/2 -translate-y-1/2 z-10 h-8 w-8 items-center justify-center rounded-full bg-white/10 border border-white/15 text-white/70 backdrop-blur-sm hover:bg-white/20 hover:text-white transition-colors"
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      <div className="relative rounded-xl border border-white/10 bg-white shadow-[0_32px_80px_-16px_rgba(22,18,16,0.55)] overflow-hidden nura-preview-shine">
        <div
          className={cn(
            "transition-all ease-out",
            visible
              ? "opacity-100 translate-x-0 duration-300"
              : "opacity-0 translate-x-3 duration-200"
          )}
        >
          {/* key forces remount → re-triggers internal stagger animations */}
          <div key={slide.id} className="flex h-[380px] md:h-[420px]">
            <PreviewSidebar active={slide.id} />
            <div className="flex-1 bg-background min-w-0 flex flex-col">
              <PanelHeader
                title={slide.title}
                subtitle={slide.subtitle}
                icon={slide.icon}
              />
              <PanelContent id={slide.id} />
            </div>
          </div>
        </div>

        <div className="h-7 bg-forest/5 border-t border-border flex items-center px-4 gap-1.5">
          <span className="h-2 w-2 rounded-full bg-sage/60" />
          <span className="h-2 w-2 rounded-full bg-amber/40" />
          <span className="h-2 w-2 rounded-full bg-border" />
          <span className="ml-auto text-[9px] font-mono text-ink-faint">
            nurahq.com
          </span>
        </div>
      </div>

      {/* Dots */}
      <div className="mt-5 flex items-center justify-center gap-2">
        {SLIDES.map((s, i) => {
          const isActive = i === current;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Slide ${i + 1} de ${SLIDES.length}: ${s.navLabel}`}
              aria-current={isActive ? "true" : undefined}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                isActive
                  ? "w-6 bg-sage nura-dot-active"
                  : "w-1.5 bg-white/20 hover:bg-white/40"
              )}
            />
          );
        })}
      </div>
    </div>
  );
}
