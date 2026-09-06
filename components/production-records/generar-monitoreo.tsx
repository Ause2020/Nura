"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Copy, QrCode } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QrCodeImage } from "@/components/production-records/qr-code-image";
import {
  QR_EXPIRY_OPTIONS,
  expiryFromPreset,
  fieldMonitorUrl,
  generateMonitorToken,
  isQrLinkActive,
  type QrExpiryPreset,
} from "@/lib/production-records/qr";
import { createClient } from "@/lib/supabase/client";
import type { MonitoringQrLink, ProductionFormTemplate } from "@/types/database";

interface GenerarMonitoreoProps {
  templates: ProductionFormTemplate[];
  links: MonitoringQrLink[];
  organizationId: string;
  userId: string;
}

export function GenerarMonitoreo({
  templates,
  links,
  organizationId,
  userId,
}: GenerarMonitoreoProps) {
  const router = useRouter();
  const activeTemplates = templates.filter((t) => t.is_active);
  const [templateId, setTemplateId] = useState(activeTemplates[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const [preset, setPreset] = useState<QrExpiryPreset>("24h");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<MonitoringQrLink | null>(null);
  const [copied, setCopied] = useState(false);

  const templateName = useMemo(
    () => templates.find((t) => t.id === (created?.template_id ?? templateId))?.name,
    [templates, created, templateId]
  );

  async function createLink() {
    if (!templateId) {
      setError("Crea una plantilla activa antes de generar un QR.");
      return;
    }
    setLoading(true);
    setError("");
    const supabase = createClient();
    const token = generateMonitorToken();
    const { data, error: insertError } = await supabase
      .from("monitoring_qr_links")
      .insert({
        organization_id: organizationId,
        template_id: templateId,
        token,
        label: label.trim() || templateName || "Monitoreo",
        expires_at: expiryFromPreset(preset).toISOString(),
        created_by: userId,
      })
      .select("*")
      .single();

    setLoading(false);
    if (insertError || !data) {
      setError(
        insertError?.message?.includes("monitoring_qr_links")
          ? "Falta ejecutar la migración 034_monitoring_qr_ocr.sql en Supabase."
          : insertError?.message ?? "No se pudo generar el QR"
      );
      return;
    }
    setCreated(data as MonitoringQrLink);
    setLabel("");
    router.refresh();
  }

  async function revoke(id: string) {
    const supabase = createClient();
    await supabase
      .from("monitoring_qr_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id);
    if (created?.id === id) setCreated(null);
    router.refresh();
  }

  async function copyUrl(url: string) {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const createdUrl = created ? fieldMonitorUrl(created.token) : "";

  return (
    <div className="px-6 py-6 space-y-6 max-w-5xl">
      <section className="bg-white rounded-md border border-border p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">Nuevo QR de terreno</h2>
          <p className="text-xs text-ink-faint mt-1">
            El monitor escanea el código, llena la plantilla en el teléfono y el
            resultado aparece en Histórico.
          </p>
        </div>

        {activeTemplates.length === 0 ? (
          <p className="text-sm text-ink-light">
            Primero crea una plantilla activa en el panel Plantillas.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-ink-light space-y-1">
              <span>Plantilla</span>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
              >
                {activeTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.area ? ` · ${t.area}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-ink-light space-y-1">
              <span>Vigencia</span>
              <select
                value={preset}
                onChange={(e) => setPreset(e.target.value as QrExpiryPreset)}
                className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
              >
                {QR_EXPIRY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-ink-light space-y-1 sm:col-span-2">
              <span>Etiqueta (turno, línea, ruta)</span>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Ej. Turno mañana · Línea 2"
              />
            </label>
          </div>
        )}

        {error && <p className="text-xs text-danger">{error}</p>}

        <Button
          type="button"
          onClick={() => void createLink()}
          disabled={loading || activeTemplates.length === 0}
          loading={loading}
        >
          <QrCode className="h-4 w-4" />
          Generar QR
        </Button>
      </section>

      {created && (
        <section className="bg-white rounded-md border border-sage/40 p-5 flex flex-col sm:flex-row gap-6 items-start">
          <QrCodeImage value={createdUrl} />
          <div className="space-y-3 min-w-0">
            <Badge variant="success">Listo para terreno</Badge>
            <h3 className="text-sm font-semibold text-ink">{created.label}</h3>
            <p className="text-xs text-ink-faint">
              {templateName} · vence{" "}
              {new Date(created.expires_at).toLocaleString("es")}
            </p>
            <p className="text-xs font-mono break-all text-ink-light bg-background rounded-md px-2 py-1.5">
              {createdUrl}
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void copyUrl(createdUrl)}
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? "Copiado" : "Copiar enlace"}
            </Button>
          </div>
        </section>
      )}

      <section>
        <h2 className="text-xs font-medium uppercase tracking-wider text-ink-light font-mono mb-2">
          QR emitidos
        </h2>
        {links.length === 0 ? (
          <p className="text-sm text-ink-faint bg-white border border-border rounded-md p-6">
            Aún no hay códigos. Genera el primero para el turno de hoy.
          </p>
        ) : (
          <div className="bg-white border border-border rounded-md divide-y divide-border">
            {links.map((link) => {
              const active = isQrLinkActive(link);
              const name = templates.find((t) => t.id === link.template_id)?.name;
              const url = fieldMonitorUrl(link.token);
              return (
                <div
                  key={link.id}
                  className="px-4 py-3 flex flex-wrap items-center gap-3 justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{link.label}</p>
                    <p className="text-xs text-ink-faint">
                      {name ?? "Plantilla"} ·{" "}
                      {active
                        ? `vence ${new Date(link.expires_at).toLocaleString("es")}`
                        : "cerrado"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={active ? "success" : "neutral"}>
                      {active ? "Activo" : "Inactivo"}
                    </Badge>
                    {active && (
                      <>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setCreated(link);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          Ver QR
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => void copyUrl(url)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => void revoke(link.id)}
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
