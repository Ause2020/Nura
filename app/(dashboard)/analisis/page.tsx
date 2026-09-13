import { redirect } from "next/navigation";
import { AnalisisView } from "@/components/ai-insights/analisis-view";
import { loadOrCreateDailyInsight } from "@/lib/ai-insights/generate";
import { getSessionProfile, getSessionUser } from "@/lib/auth/cached-session";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { startDevTimer } from "@/lib/perf/dev-time";
import { createClient } from "@/lib/supabase/server";

export default async function AnalisisPage() {
  const endTimer = startDevTimer("/analisis");
  const organizationId = await requireOrganizationId();
  const [user, profile] = await Promise.all([
    getSessionUser(),
    getSessionProfile(),
  ]);
  if (!user) redirect("/login");
  if (!hasPermission(profile?.role, PERMISSIONS.analysis.read)) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const { insight, missingTable } = await loadOrCreateDailyInsight(
    organizationId,
    supabase
  );

  if (missingTable) {
    endTimer();
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
    endTimer();
    return (
      <div className="px-6 py-10">
        <div className="rounded-md border border-border bg-white p-4 text-sm text-ink-light max-w-2xl">
          No se pudo generar el diagnóstico de hoy. Intenta recargar en unos minutos.
        </div>
      </div>
    );
  }

  endTimer();
  return <AnalisisView insight={insight} />;
}
