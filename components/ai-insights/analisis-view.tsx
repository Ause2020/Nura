import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  ClipboardList,
  Clock3,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  formatInsightDate,
  hoursUntilNextBriefing,
} from "@/lib/ai-insights/period";
import type {
  DailyInsight,
  InsightFinding,
  InsightModule,
  InsightRisk,
} from "@/lib/ai-insights/types";
import { cn } from "@/lib/utils";
import { AnalisisRegenerate } from "@/components/ai-insights/analisis-enricher";
import { ModuleHeader } from "@/components/layout/header";

const RISK_COPY: Record<
  InsightRisk,
  { label: string; variant: "success" | "warning" | "danger"; tone: string }
> = {
  ok: {
    label: "Bajo control",
    variant: "success",
    tone: "border-sage/40 bg-sage-light/40",
  },
  attention: {
    label: "Requiere atención",
    variant: "warning",
    tone: "border-amber/40 bg-amber-50",
  },
  critical: {
    label: "Crítico",
    variant: "danger",
    tone: "border-danger/40 bg-red-50",
  },
};

const MODULE_META: Record<
  InsightModule,
  { label: string; href: string; icon: typeof ShieldCheck }
> = {
  haccp: { label: "Plan HACCP", href: "/haccp", icon: ShieldCheck },
  monitoreo: { label: "Monitoreo", href: "/registros", icon: ClipboardList },
  nc: { label: "No conformidades", href: "/capa", icon: AlertTriangle },
};

const URGENCY_LABEL = {
  now: "Hoy",
  soon: "Esta semana",
  watch: "Vigilar",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function FindingRow({ finding }: { finding: InsightFinding }) {
  return (
    <Link
      href={finding.href}
      className="block rounded-md border border-border bg-white px-3 py-2.5 hover:bg-background transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink">{finding.title}</p>
        <Badge
          variant={
            finding.severity === "critical"
              ? "danger"
              : finding.severity === "warning"
                ? "warning"
                : "neutral"
          }
          showDot={false}
          className="shrink-0"
        >
          {finding.severity === "critical"
            ? "Crítico"
            : finding.severity === "warning"
              ? "Pendiente"
              : "Info"}
        </Badge>
      </div>
      <p className="text-xs text-ink-light mt-1 leading-relaxed">{finding.detail}</p>
    </Link>
  );
}

interface AnalisisViewProps {
  insight: DailyInsight;
}

export function AnalisisView({ insight }: AnalisisViewProps) {
  const risk = RISK_COPY[insight.overallRisk];
  const hoursLeft = hoursUntilNextBriefing();
  const { snapshot, analysis, findings } = insight;

  const byModule = {
    haccp: findings.filter((f) => f.module === "haccp"),
    monitoreo: findings.filter((f) => f.module === "monitoreo"),
    nc: findings.filter((f) => f.module === "nc"),
  };

  const stats = [
    {
      label: "Plan HACCP",
      value: `${snapshot.haccp.completedSteps}/12`,
      hint: snapshot.haccp.hasPlan
        ? `Paso actual ${snapshot.haccp.currentStep}`
        : "Sin plan",
      href: "/haccp",
    },
    {
      label: "Monitoreo 7d",
      value: `${snapshot.monitoreo.pccRecords7d.compliancePct}%`,
      hint:
        snapshot.monitoreo.trend === "worsening"
          ? "Tendencia a la baja"
          : snapshot.monitoreo.trend === "improving"
            ? "Tendencia al alza"
            : `${snapshot.monitoreo.pccRecords7d.total} registros PCC`,
      href: "/registros",
    },
    {
      label: "NC abiertas",
      value: String(snapshot.ncs.open),
      hint: `${snapshot.ncs.overdue} vencidas · ${snapshot.ncs.criticalOpen} críticas`,
      href: "/capa",
    },
  ];

  return (
    <>
      <ModuleHeader
        title="Análisis"
        description="Diagnóstico diario del sistema de inocuidad"
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-ink-faint">
              <Clock3 className="h-3.5 w-3.5" />
              <span>
                {hoursLeft === 0
                  ? "Nuevo análisis a medianoche (Santiago)"
                  : `Próximo análisis en ${hoursLeft} h`}
              </span>
            </div>
            <AnalisisRegenerate />
          </div>
        }
      />

      <div className="px-6 py-4 space-y-6 max-w-5xl">
        <section className={cn("rounded-md border p-5", risk.tone)}>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <BrainCircuit className="h-4 w-4 text-forest" />
            <span className="text-xs font-mono uppercase tracking-wider text-ink-light">
              {formatInsightDate(insight.periodDate)}
            </span>
            <Badge variant={risk.variant}>{risk.label}</Badge>
            <span className="text-xs text-ink-faint">
              Generado a las {formatTime(insight.generatedAt)}
              {insight.source === "ai"
                ? " · Interpretación IA"
                : " · Diagnóstico automático"}
            </span>
          </div>
          <h2 className="text-lg font-semibold text-ink tracking-tight font-display">
            {analysis.headline || insight.headline}
          </h2>
          <p className="text-sm text-ink-light mt-2 leading-relaxed max-w-3xl">
            {analysis.summary || insight.summary}
          </p>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {stats.map((stat) => (
            <Link
              key={stat.label}
              href={stat.href}
              className="bg-white rounded-md border border-border p-4 hover:bg-background transition-colors"
            >
              <p className="text-xs font-mono uppercase tracking-wider text-ink-faint">
                {stat.label}
              </p>
              <p className="text-3xl font-mono font-semibold text-forest mt-2">
                {stat.value}
              </p>
              <p className="text-xs text-ink-light mt-1">{stat.hint}</p>
            </Link>
          ))}
        </section>

        {analysis.priorities.length > 0 && (
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider text-ink-light font-mono mb-2">
              Prioridades de hoy
            </h3>
            <ol className="bg-white rounded-md border border-border divide-y divide-border">
              {analysis.priorities.map((item, index) => (
                <li key={`${item.title}-${index}`}>
                  <Link
                    href={item.href}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-background transition-colors"
                  >
                    <span className="font-mono text-xs text-ink-faint w-5 pt-0.5">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-ink">{item.title}</p>
                        <Badge
                          variant={
                            item.urgency === "now"
                              ? "danger"
                              : item.urgency === "soon"
                                ? "warning"
                                : "neutral"
                          }
                          showDot={false}
                        >
                          {URGENCY_LABEL[item.urgency]}
                        </Badge>
                      </div>
                      <p className="text-xs text-ink-light mt-1">{item.why}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-ink-faint shrink-0 mt-0.5" />
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="grid md:grid-cols-3 gap-4">
          {(["haccp", "monitoreo", "nc"] as InsightModule[]).map((module) => {
            const meta = MODULE_META[module];
            const Icon = meta.icon;
            const narrative =
              module === "haccp"
                ? analysis.haccpNarrative
                : module === "monitoreo"
                  ? analysis.monitoreoNarrative
                  : analysis.ncNarrative;
            const items = byModule[module];

            return (
              <article
                key={module}
                className="bg-white rounded-md border border-border p-4 flex flex-col"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-forest" />
                    <h3 className="text-sm font-semibold text-ink">{meta.label}</h3>
                  </div>
                  <Link
                    href={meta.href}
                    className="text-xs text-forest hover:underline"
                  >
                    Ir
                  </Link>
                </div>
                <p className="text-xs text-ink-light leading-relaxed mb-3">{narrative}</p>
                <div className="space-y-2 mt-auto">
                  {items.length === 0 ? (
                    <div className="flex items-center gap-2 text-xs text-sage">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Sin alertas en este módulo
                    </div>
                  ) : (
                    items.map((finding) => (
                      <FindingRow key={finding.id} finding={finding} />
                    ))
                  )}
                </div>
              </article>
            );
          })}
        </section>

        {snapshot.haccp.team.some((m) => m.missingTraining || m.trainingExpired) && (
          <section className="bg-white rounded-md border border-border p-4">
            <h3 className="text-xs font-medium uppercase tracking-wider text-ink-light font-mono mb-3">
              Capacitación del equipo HACCP
            </h3>
            <ul className="divide-y divide-border">
              {snapshot.haccp.team
                .filter((m) => m.missingTraining || m.trainingExpired)
                .map((member) => (
                  <li
                    key={`${member.name}-${member.role}`}
                    className="py-2 flex items-center justify-between gap-3 text-sm"
                  >
                    <div>
                      <p className="font-medium text-ink">{member.name}</p>
                      <p className="text-xs text-ink-faint">{member.role || "Sin cargo"}</p>
                    </div>
                    <Badge variant={member.trainingExpired ? "danger" : "warning"}>
                      {member.trainingExpired
                        ? "Vencida"
                        : member.missingTraining
                          ? "Sin registro"
                          : "Al día"}
                    </Badge>
                  </li>
                ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
