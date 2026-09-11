import { NextResponse } from "next/server";
import { rateLimitResponse } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  let email = "";
  let password = "";
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    email = String(body.email ?? "").trim().toLowerCase();
    password = String(body.password ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!email || !email.includes("@") || !password) {
    return NextResponse.json({ error: "Credenciales incorrectas" }, { status: 401 });
  }

  const limited = await rateLimitResponse({
    request,
    email,
    only: ["email"],
    policy: "AUTH",
  });
  if (limited) return limited;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return NextResponse.json({ error: "Credenciales incorrectas" }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
