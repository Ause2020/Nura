import { NextResponse } from "next/server";
import {
  generateDailyInsight,
  getOrCreateDailyInsight,
} from "@/lib/ai-insights/generate";
import { getLatestInsight } from "@/lib/ai-insights/store";
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

export async function POST(request: Request) {
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

  const body = (await request.json().catch(() => ({}))) as { force?: unknown };
  const force = body.force === true;

  try {
    const insight = force
      ? await generateDailyInsight(orgId, supabase, { force: true })
      : await getOrCreateDailyInsight(orgId, supabase);
    return NextResponse.json({
      insight,
      cached: !force,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo generar el análisis";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
