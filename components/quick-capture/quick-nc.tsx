"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChipGroup, PhotoCapture, QuickCaptureShell } from "./quick-capture-modal";
import type { NcSeverity } from "@/types/database";

const SEVERITY_OPTIONS: { value: NcSeverity; label: string }[] = [
  { value: "critical", label: "Crítica" },
  { value: "major", label: "Mayor" },
  { value: "minor", label: "Menor" },
  { value: "observation", label: "Observación" },
];

const AREA_OPTIONS = [
  { value: "Recepción", label: "Recepción" },
  { value: "Proceso", label: "Proceso" },
  { value: "Empaque", label: "Empaque" },
  { value: "Bodega", label: "Bodega" },
  { value: "Despacho", label: "Despacho" },
  { value: "Otro", label: "Otro" },
];

export function QuickNc({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<NcSeverity>("major");
  const [area, setArea] = useState("Proceso");
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
      setError("Describe brevemente la no conformidad");
      return;
    }
    setLoading(true);
    setError("");

    const fd = new FormData();
    fd.append("description", description.trim());
    fd.append("severity", severity);
    fd.append("area", area);
    if (photo) fd.append("photo", photo);

    const res = await fetch("/api/quick-capture/nc", {
      method: "POST",
      body: fd,
    });
    const json = await res.json() as { ncId?: string; error?: string };

    setLoading(false);
    if (!res.ok || !json.ncId) {
      setError(json.error ?? "Error al guardar");
      return;
    }

    onClose();
    router.push(`/capa/${json.ncId}`);
    router.refresh();
  }

  return (
    <QuickCaptureShell
      title="No Conformidad rápida"
      onClose={onClose}
      onSubmit={handleSubmit}
      loading={loading}
      error={error}
      submitLabel="Registrar NC"
    >
      <PhotoCapture onChange={handlePhoto} preview={photoPreview} />

      <div className="space-y-1">
        <label className="text-xs font-mono uppercase tracking-wider text-ink-light">
          ¿Qué pasó? <span className="text-danger">*</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe la desviación encontrada..."
          rows={3}
          className="w-full px-3 py-2 text-sm border border-border rounded-md resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage placeholder:text-ink-faint"
        />
      </div>

      <ChipGroup
        label="Área"
        options={AREA_OPTIONS}
        value={area}
        onChange={setArea}
        cols={3}
      />

      <ChipGroup
        label="Severidad"
        options={SEVERITY_OPTIONS}
        value={severity}
        onChange={setSeverity}
        cols={2}
      />
    </QuickCaptureShell>
  );
}
