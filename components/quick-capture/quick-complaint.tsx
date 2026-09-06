"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChipGroup, PhotoCapture, QuickCaptureShell } from "./quick-capture-modal";
import {
  COMPLAINT_TYPES,
  COMPLAINT_SEVERITIES,
} from "@/lib/complaints/constants";
import type { ComplaintSeverity, ComplaintType } from "@/types/database";

export function QuickComplaint({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [complaintType, setComplaintType] = useState<ComplaintType>("other");
  const [severity, setSeverity] = useState<ComplaintSeverity>("quality");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handlePhoto(file: File | null) {
    setPhoto(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => setPhotoPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setPhotoPreview(null);
    }
  }

  async function handleSubmit() {
    if (!description.trim()) {
      setError("Describe brevemente el reclamo");
      return;
    }
    setLoading(true);
    setError("");

    const fd = new FormData();
    fd.append("description", description.trim());
    fd.append("complaint_type", complaintType);
    fd.append("severity", severity);
    if (photo) fd.append("photo", photo);

    const res = await fetch("/api/quick-capture/complaint", {
      method: "POST",
      body: fd,
    });
    const json = await res.json() as { complaintId?: string; error?: string };

    setLoading(false);
    if (!res.ok || !json.complaintId) {
      setError(json.error ?? "Error al guardar");
      return;
    }

    onClose();
    router.push(`/reclamos/${json.complaintId}`);
    router.refresh();
  }

  return (
    <QuickCaptureShell
      title="Reclamo rápido"
      onClose={onClose}
      onSubmit={handleSubmit}
      loading={loading}
      error={error}
      submitLabel="Registrar reclamo"
    >
      <PhotoCapture onChange={handlePhoto} preview={photoPreview} />

      <div className="space-y-1">
        <label className="text-xs font-mono uppercase tracking-wider text-ink-light">
          ¿Cuál es el reclamo? <span className="text-danger">*</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe el problema reportado por el cliente..."
          rows={3}
          className="w-full px-3 py-2 text-sm border border-border rounded-md resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage placeholder:text-ink-faint"
        />
      </div>

      <ChipGroup
        label="Tipo"
        options={COMPLAINT_TYPES.map((t) => ({ value: t.value, label: t.label }))}
        value={complaintType}
        onChange={setComplaintType}
        cols={2}
      />

      <ChipGroup
        label="Severidad"
        options={COMPLAINT_SEVERITIES.map((s) => ({
          value: s.value,
          label: s.label,
        }))}
        value={severity}
        onChange={setSeverity}
        cols={2}
      />
    </QuickCaptureShell>
  );
}
