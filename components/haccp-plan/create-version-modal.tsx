"use client";

import { useEffect, useState } from "react";
import { STEP_META } from "@/lib/haccp-plan/constants";

export function CreateVersionModal({
  open,
  stepId,
  onClose,
  onSubmit,
}: {
  open: boolean;
  stepId: number;
  onClose: () => void;
  onSubmit: (input: { title: string; version: string; changes: string }) => Promise<void>;
}) {
  const meta = STEP_META.find((item) => item.id === stepId);
  const [title, setTitle] = useState(`Plan HACCP - ${meta?.title ?? ""}`);
  const [version, setVersion] = useState("1.0");
  const [changes, setChanges] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(`Plan HACCP - ${meta?.title ?? ""}`);
    setChanges("");
    setError("");
  }, [open, stepId, meta?.title]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-lg bg-white border border-border p-5">
        <h3 className="text-sm font-semibold text-ink">Crear versión documental</h3>
        <p className="text-xs text-ink-light mt-1">
          Se guarda un snapshot de este paso en Documentos.
        </p>
        <div className="mt-4 space-y-3">
          <label className="block text-xs text-ink-light">
            Título
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-1 w-full hp-input"
            />
          </label>
          <label className="block text-xs text-ink-light">
            Versión
            <input
              value={version}
              onChange={(event) => setVersion(event.target.value)}
              className="mt-1 w-full hp-input"
            />
          </label>
          <label className="block text-xs text-ink-light">
            Descripción de cambios
            <textarea
              value={changes}
              onChange={(event) => setChanges(event.target.value)}
              rows={3}
              className="mt-1 w-full hp-input"
            />
          </label>
        </div>
        {error && <p className="text-xs text-danger mt-2">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-8 px-3 text-xs text-ink-light">
            Cancelar
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              setError("");
              try {
                await onSubmit({ title, version, changes });
                onClose();
              } catch (err) {
                setError(err instanceof Error ? err.message : "No se pudo crear");
              } finally {
                setLoading(false);
              }
            }}
            className="h-8 px-3 rounded-md text-xs bg-sage text-white"
          >
            {loading ? "Guardando…" : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}
