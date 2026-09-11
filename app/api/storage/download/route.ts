import { NextResponse } from "next/server";
import { getSessionProfile, getSessionUser } from "@/lib/auth/cached-session";
import { createPrivateDownloadUrl } from "@/lib/storage/download";
import {
  parseDownloadJsonBody,
  parseDownloadSearchParams,
} from "@/lib/storage/download-policy";
import { createClient } from "@/lib/supabase/server";

function invalid() {
  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}

function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

async function authorize() {
  const user = await getSessionUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const profile = await getSessionProfile();
  if (!profile?.organization_id) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return {
    supabase: await createClient(),
    organizationId: profile.organization_id,
  };
}

async function respond(
  parsed: ReturnType<typeof parseDownloadSearchParams>,
  ctx: { supabase: Awaited<ReturnType<typeof createClient>>; organizationId: string }
) {
  if (!parsed.ok) return invalid();

  const result = await createPrivateDownloadUrl({
    supabase: ctx.supabase,
    organizationId: ctx.organizationId,
    kind: parsed.kind,
    resourceId: parsed.resourceId,
    fileId: parsed.fileId,
  });

  if (!result.ok) return notFound();

  return NextResponse.json({
    url: result.url,
    expiresIn: result.expiresIn,
  });
}

export async function GET(request: Request) {
  const auth = await authorize();
  if ("error" in auth) return auth.error;

  return respond(parseDownloadSearchParams(new URL(request.url).searchParams), auth);
}

export async function POST(request: Request) {
  const auth = await authorize();
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalid();
  }

  return respond(parseDownloadJsonBody(body), auth);
}
