interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

interface SendEmailResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "Nura <onboarding@resend.dev>";

  if (!apiKey) {
    return { ok: false, skipped: true, error: "RESEND_API_KEY not configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { ok: false, error: text };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Email send failed",
    };
  }
}

export async function getUserEmail(
  adminClient: NonNullable<ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>>,
  userId: string
): Promise<string | null> {
  const { data, error } = await adminClient.auth.admin.getUserById(userId);
  if (error || !data.user?.email) return null;
  return data.user.email;
}

export async function getUserEmails(
  adminClient: NonNullable<ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>>,
  userIds: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)];
  const pairs = await Promise.all(
    unique.map(async (id) => {
      const email = await getUserEmail(adminClient, id);
      return [id, email] as const;
    })
  );
  const map = new Map<string, string>();
  for (const [id, email] of pairs) {
    if (email) map.set(id, email);
  }
  return map;
}
