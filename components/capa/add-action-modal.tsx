"use client";

import { useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { ACTION_TYPE_LABELS } from "@/lib/capa/constants";
import { getSuggestedDueDate } from "@/lib/capa/utils";
import type { CapaActionType, NcSeverity } from "@/types/database";

interface AddActionModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    action_type: CapaActionType;
    description: string;
    responsible: string;
    due_date: string;
  }) => Promise<void>;
  severity: NcSeverity;
}

export function AddActionModal({
  open,
  onClose,
  onSubmit,
  severity,
}: AddActionModalProps) {
  const [loading, setLoading] = useState(false);
  const [actionType, setActionType] = useState<CapaActionType>("corrective");
  const [description, setDescription] = useState("");
  const [responsible, setResponsible] = useState("");
  const [dueDate, setDueDate] = useState(getSuggestedDueDate(severity));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!description.trim() || !responsible.trim()) return;

    setLoading(true);
    await onSubmit({
      action_type: actionType,
      description: description.trim(),
      responsible: responsible.trim(),
      due_date: dueDate,
    });
    setLoading(false);
    setDescription("");
    setResponsible("");
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Agregar acción" className="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4 -mt-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
            Tipo de acción
          </label>
          <select
            value={actionType}
            onChange={(e) => setActionType(e.target.value as CapaActionType)}
            className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
          >
            {(Object.keys(ACTION_TYPE_LABELS) as CapaActionType[]).map((t) => (
              <option key={t} value={t}>
                {ACTION_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        <Textarea
          label="Descripción"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />

        <Input
          label="Responsable"
          value={responsible}
          onChange={(e) => setResponsible(e.target.value)}
          required
        />

        <Input
          label="Fecha límite"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          required
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={loading}>
            Agregar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
