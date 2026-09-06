import Link from "next/link";
import { InvitationAcceptForm } from "@/components/team/invitation-accept-form";
import {
  getInvitationByToken,
  isInvitationValid,
} from "@/lib/team/invitations";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/database";

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitation = await getInvitationByToken(token);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!invitation || !isInvitationValid(invitation)) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-background">
        <div className="w-full max-w-md bg-white border border-border rounded-md p-6 text-center space-y-4">
          <h1 className="font-display text-lg font-semibold text-ink">
            Invitación no válida
          </h1>
          <p className="text-sm text-ink-faint">
            El enlace expiró o ya fue utilizado. Pide a tu administrador que
            genere uno nuevo.
          </p>
          <Link href="/login" className="text-sm text-forest underline">
            Ir a iniciar sesión
          </Link>
        </div>
      </div>
    );
  }

  const organizationName =
    invitation.organizations?.name ?? "tu organización";
  const invitedEmail = invitation.email;
  const loggedInEmail = user?.email ?? null;
  const emailMatches =
    !!loggedInEmail &&
    loggedInEmail.trim().toLowerCase() === invitedEmail.trim().toLowerCase();

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-background">
      <div className="w-full max-w-md bg-white border border-border rounded-md p-6">
        <div className="mb-6">
          <p className="text-xs text-ink-faint uppercase tracking-wider font-mono mb-1">
            Nura
          </p>
          <h1 className="font-display text-lg font-semibold text-ink">
            Invitación al equipo
          </h1>
        </div>

        <InvitationAcceptForm
          token={token}
          organizationName={organizationName}
          role={invitation.role as UserRole}
          invitedEmail={invitedEmail}
          isLoggedIn={!!user}
          loggedInEmail={loggedInEmail}
          emailMatches={emailMatches}
        />
      </div>
    </div>
  );
}
