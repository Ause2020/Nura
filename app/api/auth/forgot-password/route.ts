import { NextResponse } from "next/server";
import { rateLimitResponse } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

function appOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  return "http://localhost:3000";
}

export async function POST(request: Request) {
  let email = "";
  try {
    const body = (await request.json()) as { email?: string };
    email = String(body.email ?? "").trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: true });
  }

  const limited = await rateLimitResponse({
    request,
    email,
    only: ["email"],
    policy: "AUTH",
  });
  if (limited) return limited;

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appOrigin()}/auth/callback?next=/recuperar/nueva`,
  });

  return NextResponse.json({ ok: true });
}
