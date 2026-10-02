import { NextResponse } from "next/server";
import { auditCompletedEmail } from "@/lib/email/templates";
import { getUserEmail, sendEmail } from "@/lib/email/send";
import { getNotificationPreferencesAdmin } from "@/lib/settings/preferences";
import { assertOrganizationAccess } from "@/lib/auth/require-permission";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function appUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path}`;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const auditId = String(body.auditId ?? "");

    if (!auditId) {
      return NextResponse.json({ error: "auditId requerido" }, { status: 400 });
    }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    const profile = profileData as {
      organization_id: string | null;
      role: string;
    } | null;

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
      await assertOrganizationAccess({
        supabase,
        organizationId: profile.organization_id,
        user,
      });
    } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: auditData } = await supabase
      .from("audits")
      .select("id, title, compliance_score, organization_id")
      .eq("id", auditId)
      .eq("organization_id", profile.organization_id)
      .single();

    const audit = auditData as {
      id: string;
      title: string;
      compliance_score: number | null;
      organization_id: string;
    } | null;

    if (!audit) {
      return NextResponse.json({ error: "Auditoría no encontrada" }, { status: 404 });
    }

    const prefs = await getNotificationPreferencesAdmin(profile.organization_id);
    if (!prefs?.email_audit_completed) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Email no configurado" }, { status: 500 });
    }

    const { data: managersData } = await admin
      .from("profiles")
      .select("id")
      .eq("organization_id", profile.organization_id)
      .in("role", ["admin", "quality_manager"]);

    const managers = (managersData ?? []) as { id: string }[];
    let emailsSent = 0;

    for (const manager of managers) {
      const email = await getUserEmail(admin, manager.id);
      if (!email) continue;

      const tpl = auditCompletedEmail({
        auditTitle: audit.title,
        complianceScore: Number(audit.compliance_score ?? 0),
        appUrl: appUrl(`/auditorias/${audit.id}/informe`),
      });

      const result = await sendEmail({ to: email, ...tpl });
      if (result.ok) emailsSent++;
    }

    return NextResponse.json({ ok: true, emailsSent });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
