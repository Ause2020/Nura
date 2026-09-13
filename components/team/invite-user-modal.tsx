"use client";

import { useState, type FormEvent } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  INVITABLE_ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
} from "@/lib/team/constants";
import type { Invitation } from "@/types/database";

interface InviteUserModalProps {
  open: boolean;
  onClose: () => void;
  onInvited: (invitation: Invitation, inviteUrl: string) => void;
}

export function InviteUserModal({
  open,
  onClose,
  onInvited,
}: InviteUserModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInviteUrl("");
    setCopied(false);

    const form = new FormData(e.currentTarget);

    const response = await fetch("/api/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        role: form.get("role"),
      }),
    });

    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(data.error ?? "Error al crear invitación");
      return;
    }

    setInviteUrl(data.inviteUrl);
    onInvited(data.invitation, data.inviteUrl);
  }

  async function copyLink() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClose() {
    setError("");
    setInviteUrl("");
    setCopied(false);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Invitar usuario">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input name="email" label="Email" type="email" required />

        <div className="space-y-1">
          <label className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
            Rol
          </label>
          <select
            name="role"
            defaultValue="quality_manager"
            className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
          >
            {INVITABLE_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          <p className="text-xs text-ink-faint">
            {ROLE_DESCRIPTIONS.quality_manager}
          </p>
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        {inviteUrl && (
          <div className="rounded-md border border-sage/30 bg-sage-light p-3 space-y-2">
            <p className="text-xs text-ink-light">
              Comparte este enlace por WhatsApp o en persona (válido 7 días):
            </p>
            <div className="flex gap-2">
              <input
                readOnly
                value={inviteUrl}
                className="flex-1 h-9 px-3 text-xs font-mono border border-border rounded-md bg-white truncate"
              />
              <Button type="button" variant="secondary" onClick={copyLink}>
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={handleClose}>
            {inviteUrl ? "Cerrar" : "Cancelar"}
          </Button>
          {!inviteUrl && (
            <Button type="submit" loading={loading}>
              Generar enlace
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
