import { NextResponse } from "next/server";
import {
  runNotificationCronAllOrgs,
  runNotificationCronForOrg,
} from "@/lib/notifications/cron";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const admin = createAdminClient();
  const isCron = Boolean(
    cronSecret && authHeader === `Bearer ${cronSecret}` && admin
  );

  if (isCron && admin) {
    const results = await runNotificationCronAllOrgs();
    return NextResponse.json({
      mode: "cron",
      organizations: results.length,
      notificationsCreated: results.reduce(
        (s, r) => s + r.notificationsCreated,
        0
      ),
      emailsSent: results.reduce((s, r) => s + r.emailsSent, 0),
    });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profileData } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  const orgId = (profileData as { organization_id: string | null } | null)
    ?.organization_id;

  if (!orgId) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  const result = await runNotificationCronForOrg(supabase, orgId);

  return NextResponse.json({
    mode: "manual",
    ...result,
  });
}
