import { redirect } from "next/navigation";
import { AnalisisEnricher } from "@/components/ai-insights/analisis-enricher";
import { AnalisisView } from "@/components/ai-insights/analisis-view";
import { isAiConfigured } from "@/lib/ai/anthropic";
import { loadOrCreateDailyInsight } from "@/lib/ai-insights/generate";
import { getSessionProfile, getSessionUser } from "@/lib/auth/cached-session";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AnalisisPage() {
  const organizationId = await requireOrganizationId();
  const [user, profile] = await Promise.all([
    getSessionUser(),
    getSessionProfile(),
  ]);
  if (!user) redirect("/login");
  if (profile?.role === "operator") redirect("/dashboard");

  const supabase = await createClient();
  const { insight, missingTable } = await loadOrCreateDailyInsight(
    organizationId,
    supabase
  );

  if (missingTable) {
    return (
      <div className="px-6 py-10">
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-ink max-w-2xl">
          <p className="font-medium">El módulo Análisis necesita la migración 033.</p>
          <p className="mt-1 text-ink-light">
            Ejecuta{" "}
            <code className="font-mono">supabase/migrations/033_ai_daily_insights.sql</code>{" "}
            en el SQL Editor de Supabase.
          </p>
        </div>
      </div>
    );
  }

  if (!insight) {
    return (
      <div className="px-6 py-10">
        <div className="rounded-md border border-border bg-white p-4 text-sm text-ink-light max-w-2xl">
          No se pudo generar el diagnóstico de hoy. Intenta recargar en unos minutos.
        </div>
      </div>
    );
  }

  const aiPending = insight.source === "rules" && isAiConfigured();

  return (
    <>
      <AnalisisView insight={insight} aiPending={aiPending} />
      <AnalisisEnricher needsAi={aiPending} />
    </>
  );
}
