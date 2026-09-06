"use client";

import { useCallback, useState } from "react";
import { Copy, Trash2, UserPlus, Users } from "lucide-react";
import { CreateTeamUserForm } from "@/components/team/create-team-user-form";
import { InviteUserModal } from "@/components/team/invite-user-modal";
import { Button } from "@/components/ui/button";
import {
  MAX_TEAM_USERS,
  ROLE_LABELS,
  getRoleLabel,
} from "@/lib/team/constants";
import { buildInvitationUrl } from "@/lib/team/urls";
import type { Invitation, UserRole } from "@/types/database";
import type { TeamMemberRow } from "@/lib/team/list";

interface TeamUsersDashboardProps {
  members: TeamMemberRow[];
  invitations: Invitation[];
  currentUserId: string;
  organizationName: string;
}

export function TeamUsersDashboard({
  members: initialMembers,
  invitations: initialInvitations,
  currentUserId,
  organizationName,
}: TeamUsersDashboardProps) {
  const [members, setMembers] = useState(initialMembers);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [actionError, setActionError] = useState("");

  const usedSlots = members.length + invitations.length;

  const refresh = useCallback(async () => {
    const response = await fetch("/api/team/members");
    if (!response.ok) return;
    const data = await response.json();
    setMembers(data.members ?? []);
    setInvitations(data.invitations ?? []);
  }, []);

  async function updateRole(memberId: string, role: UserRole) {
    setActionError("");
    const response = await fetch(`/api/team/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const data = await response.json();
    if (!response.ok) {
      setActionError(data.error ?? "Error al cambiar rol");
      return;
    }
    setMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, role } : m))
    );
  }

  async function removeMember(memberId: string) {
    if (!confirm("¿Eliminar este usuario? Perderá acceso inmediatamente.")) {
      return;
    }
    setActionError("");
    const response = await fetch(`/api/team/members/${memberId}`, {
      method: "DELETE",
    });
    const data = await response.json();
    if (!response.ok) {
      setActionError(data.error ?? "Error al eliminar");
      return;
    }
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
  }

  async function cancelInvitation(id: string) {
    setActionError("");
    const response = await fetch(`/api/team/invitations/${id}`, {
      method: "DELETE",
    });
    const data = await response.json();
    if (!response.ok) {
      setActionError(data.error ?? "Error al cancelar");
      return;
    }
    setInvitations((prev) => prev.filter((inv) => inv.id !== id));
  }

  async function copyInviteLink(token: string) {
    await navigator.clipboard.writeText(buildInvitationUrl(token));
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">Usuarios del equipo</h2>
          <p className="text-xs text-ink-faint mt-0.5">
            {organizationName} · {usedSlots}/{MAX_TEAM_USERS} plazas
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => setCreateOpen(true)}
            disabled={usedSlots >= MAX_TEAM_USERS}
          >
            <UserPlus className="h-4 w-4" />
            Crear credenciales
          </Button>
          <Button
            onClick={() => setInviteOpen(true)}
            disabled={usedSlots >= MAX_TEAM_USERS}
          >
            <Users className="h-4 w-4" />
            Invitar
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {actionError && (
          <p className="text-xs text-danger bg-red-50 border border-red-100 rounded-md px-3 py-2">
            {actionError}
          </p>
        )}

        <section className="bg-white border border-border rounded-md overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-ink">Miembros activos</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-faint uppercase tracking-wider font-mono border-b border-border">
                  <th className="px-4 py-2 font-medium">Nombre</th>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Rol</th>
                  <th className="px-4 py-2 font-medium w-28">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-ink">{member.full_name}</td>
                    <td className="px-4 py-3 text-ink-light font-mono text-xs">
                      {member.email}
                    </td>
                    <td className="px-4 py-3">
                      {member.id === currentUserId ? (
                        <span className="text-ink-light">
                          {getRoleLabel(member.role)} (tú)
                        </span>
                      ) : (
                        <select
                          value={member.role}
                          onChange={(e) =>
                            updateRole(member.id, e.target.value as UserRole)
                          }
                          className="h-8 px-2 text-xs border border-border rounded-md bg-white"
                        >
                          {(["admin", "quality_manager", "operator"] as UserRole[]).map(
                            (role) => (
                              <option key={role} value={role}>
                                {ROLE_LABELS[role]}
                              </option>
                            )
                          )}
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {member.id !== currentUserId && (
                        <button
                          type="button"
                          onClick={() => removeMember(member.id)}
                          className="text-ink-faint hover:text-danger transition-colors"
                          aria-label="Eliminar usuario"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {invitations.length > 0 && (
          <section className="bg-white border border-border rounded-md overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-ink">
                Invitaciones pendientes
              </h2>
            </div>
            <div className="divide-y divide-border">
              {invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div>
                    <p className="text-sm text-ink">{invitation.email}</p>
                    <p className="text-xs text-ink-faint">
                      {getRoleLabel(invitation.role)} · expira{" "}
                      {new Date(invitation.expires_at).toLocaleDateString("es")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => copyInviteLink(invitation.token)}
                    >
                      <Copy className="h-4 w-4" />
                      Copiar enlace
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => cancelInvitation(invitation.id)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <InviteUserModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={(invitation) => {
          setInvitations((prev) => [invitation, ...prev]);
        }}
      />

      <CreateTeamUserForm
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={refresh}
      />
    </>
  );
}
