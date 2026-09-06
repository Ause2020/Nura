import { NextResponse } from "next/server";
import { generateDailyInsight } from "@/lib/ai-insights/generate";
import { isInsightFresh, periodDateInSantiago } from "@/lib/ai-insights/period";
import { getInsightForDate, getLatestInsight } from "@/lib/ai-insights/store";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single();

  const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
  const role = (profile as { role?: string } | null)?.role;
  if (!orgId) return NextResponse.json({ error: "No organization" }, { status: 400 });
  if (role === "operator") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const insight = await getLatestInsight(orgId, supabase);
  return NextResponse.json({ insight });
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single();

  const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
  const role = (profile as { role?: string } | null)?.role;
  if (!orgId) return NextResponse.json({ error: "No organization" }, { status: 400 });
  if (role === "operator") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
