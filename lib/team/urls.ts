export function getInvitationUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/invitacion/${token}`;
}

export const buildInvitationUrl = getInvitationUrl;
