import { NextResponse } from "next/server";
import { complaintCriticalEmail } from "@/lib/email/templates";
import { getUserEmail, sendEmail } from "@/lib/email/send";
import { getNotificationPreferencesAdmin } from "@/lib/settings/preferences";
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
    const complaintId = String(body.complaintId ?? "");

    if (!complaintId) {
      return NextResponse.json(
        { error: "complaintId requerido" },
        { status: 400 }
      );
    }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const profile = profileData as { organization_id: string | null } | null;

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: complaintData } = await supabase
      .from("customer_complaints")
      .select("id, complaint_number, customer_name, description, organization_id")
      .eq("id", complaintId)
      .eq("organization_id", profile.organization_id)
      .single();

    const complaint = complaintData as {
      id: string;
      complaint_number: string;
      customer_name: string;
      description: string;
      organization_id: string;
    } | null;

    if (!complaint) {
      return NextResponse.json({ error: "Reclamo no encontrado" }, { status: 404 });
    }

    const prefs = await getNotificationPreferencesAdmin(profile.organization_id);
    if (prefs?.email_capa_due === false) {
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

      const tpl = complaintCriticalEmail({
        complaintNumber: complaint.complaint_number,
        customerName: complaint.customer_name,
        description: complaint.description.slice(0, 120),
        appUrl: appUrl(`/reclamos/${complaint.id}`),
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
