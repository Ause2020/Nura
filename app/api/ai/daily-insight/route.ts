import { NextResponse } from "next/server";
import { generateDailyInsight } from "@/lib/ai-insights/generate";
import { isInsightFresh, periodDateInSantiago } from "@/lib/ai-insights/period";
import { getInsightForDate, getLatestInsight } from "@/lib/ai-insights/store";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { authzResponse, requirePermission } from "@/lib/auth/require-permission";

export async function GET() {
  let supabase;
  let orgId: string;
  try {
    const session = await requirePermission(PERMISSIONS.analysis.read);
    supabase = session.supabase;
    orgId = session.profile.organization_id;
  } catch (error) {
    const { body, status } = authzResponse(error);
    return NextResponse.json(body, { status });
  }

  const insight = await getLatestInsight(orgId, supabase);
  return NextResponse.json({ insight });
}

export async function POST() {
  let supabase;
  let orgId: string;
  try {
    const session = await requirePermission(PERMISSIONS.analysis.read);
    supabase = session.supabase;
    orgId = session.profile.organization_id;
  } catch (error) {
    const { body, status } = authzResponse(error);
    return NextResponse.json(body, { status });
  }

  const today = await getInsightForDate(orgId, periodDateInSantiago(), supabase);
  if (today && isInsightFresh(today.generatedAt) && today.source === "ai") {
    return NextResponse.json({ insight: today, cached: true });
  }

  try {
    const insight = await generateDailyInsight(orgId, supabase);
    return NextResponse.json({
      insight,
      cached: insight.source === "ai" && today?.source === "ai",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo generar el análisis";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
