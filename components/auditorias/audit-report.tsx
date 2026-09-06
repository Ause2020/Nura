"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, FileSpreadsheet, FileText, Send } from "lucide-react";
import { RadarChart } from "@/components/auditorias/radar-chart";
import { ComplianceRing } from "@/components/auditorias/compliance-ring";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { countResults, getSectionScores } from "@/lib/audit/utils";
import { createNcFromAuditFinding } from "@/lib/integrations/nc-from-audit";
import { createClient } from "@/lib/supabase/client";
import {
  dateLocale,
  localizeSection,
  localizeStandard,
} from "@/lib/export/audit-i18n";
import {
  getAuditLabels,
  localAuditType,
  localFindingType,
  localResult,
  type ExportLang,
} from "@/lib/export/labels";
import type {
  Audit,
  AuditChecklistItem,
  AuditFinding,
  FindingType,
  NcSeverity,
} from "@/types/database";

interface AuditReportProps {
  audit: Audit;
  items: AuditChecklistItem[];
  findings: AuditFinding[];
  organizationId: string;
  userId: string;
  organizationLogoUrl?: string | null;
}

function findingSeverity(type: FindingType): NcSeverity {
  if (type === "major_nc") return "major";
  if (type === "minor_nc") return "minor";
  return "observation";
}

export function AuditReport({
  audit,
  items,
  findings: initialFindings,
  organizationId,
  userId,
  organizationLogoUrl,
}: AuditReportProps) {
  const router = useRouter();
  const printRef = useRef<HTMLDivElement>(null);
  const [findings, setFindings] = useState(initialFindings);
  const [sendingCapa, setSendingCapa] = useState(false);
  const [capaMessage, setCapaMessage] = useState("");
  const [auditorSign, setAuditorSign] = useState(audit.auditor_name ?? "");
  const [repSign, setRepSign] = useState("");
  const [exportLang, setExportLang] = useState<ExportLang>("es");
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingXls, setDownloadingXls] = useState(false);

  const L = getAuditLabels(exportLang);
  const locale = dateLocale(exportLang);
  const score = Number(audit.compliance_score ?? 0);
  const sectionScores = getSectionScores(items);
  const radarData = sectionScores.map((s) => ({
    section: localizeSection(s.section, exportLang),
    score: s.score,
  }));
  const counts = countResults(items);

  const itemMap = new Map(items.map((i) => [i.id, i]));
  const capaEligible = findings.filter(
    (f) =>
      (f.finding_type === "major_nc" || f.finding_type === "minor_nc") &&
      !f.capa_id
  );

  async function handleSendToCapa() {
    if (capaEligible.length === 0) return;

    setSendingCapa(true);
    setCapaMessage("");
    const supabase = createClient();
    let created = 0;

    for (const finding of capaEligible) {
      const item = finding.checklist_item_id
        ? itemMap.get(finding.checklist_item_id)
        : null;

      const result = await createNcFromAuditFinding(supabase, {
        organizationId,
        userId,
        auditId: audit.id,
        findingId: finding.id,
        description: `[${localFindingType(finding.finding_type, L)}] ${finding.description}${item ? ` — ${L.colRequirement}: ${item.requirement}` : ""}`,
        severity: findingSeverity(finding.finding_type),
        area: item?.section ?? L.auditReport,
        clauseReference: item?.requirement ?? null,
      });

      if (!result) continue;

      await supabase
        .from("audit_findings")
        .update({ capa_id: result.ncId })
        .eq("id", finding.id);

      setFindings((prev) =>
        prev.map((f) =>
          f.id === finding.id ? { ...f, capa_id: result.ncId } : f
        )
      );
      created++;
    }

    if (created > 0) {
      setCapaMessage(`${created} ${L.capaSent}`);
    } else {
      setCapaMessage(L.capaFailed);
    }
    setSendingCapa(false);
    router.refresh();
  }

  async function handleDownloadPdf() {
    setDownloadingPdf(true);
    try {
      const qs = new URLSearchParams({ lang: exportLang });
      if (auditorSign) qs.set("auditor", auditorSign);
      if (repSign) qs.set("rep", repSign);
      const res = await fetch(`/api/export/audit-pdf/${audit.id}?${qs}`);
      if (!res.ok) throw new Error("Error al generar PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers.get("content-disposition")?.split('filename="')[1]?.slice(0, -1) ??
        `informe-auditoria.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("No se pudo generar el PDF");
    } finally {
      setDownloadingPdf(false);
    }
  }

  async function handleDownloadExcel() {
    setDownloadingXls(true);
    try {
      const { downloadExcel } = await import("@/lib/export/excel");

      const findingRows = findings.map((f, idx) => {
        const item = f.checklist_item_id ? itemMap.get(f.checklist_item_id) : null;
        const capaStatus = f.capa_id
          ? L.capaCreated
          : f.finding_type === "major_nc" || f.finding_type === "minor_nc"
          ? L.capaPending
          : L.notApplicableShort;
        return [
          idx + 1,
          localFindingType(f.finding_type, L),
          item ? localizeSection(item.section, exportLang) : "—",
          item?.requirement ?? "—",
          f.description,
          capaStatus,
          new Date(f.created_at).toLocaleDateString(locale),
        ];
      });

      const checklistRows = items.map((item) => [
        localizeSection(item.section, exportLang),
        item.requirement,
        item.reference ?? "—",
        localResult(item.result, L),
        item.finding ?? "—",
      ]);

      const slug = audit.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 30);

      await downloadExcel({
        filename: `auditoria-${slug}-${new Date().toISOString().slice(0, 10)}`,
        sheets: [
          {
            name: L.sheetFindings,
            columns: [
              { header: L.colNumber, width: 5 },
              { header: L.colType, width: 18 },
              { header: L.colSection, width: 22 },
              { header: L.colRequirement, width: 30 },
              { header: L.colDescription, width: 50 },
              { header: L.colCapaStatus, width: 15 },
              { header: L.colDate, width: 14 },
            ],
            rows: findingRows,
          },
          {
            name: L.sheetChecklist,
            columns: [
              { header: L.colSection, width: 22 },
              { header: L.colRequirement, width: 40 },
              { header: "Ref.", width: 14 },
              { header: L.colResult, width: 16 },
              { header: L.colFinding, width: 40 },
            ],
            rows: checklistRows,
          },
        ],
      });
    } catch {
      alert("No se pudo generar el Excel");
    } finally {
      setDownloadingXls(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 items-center no-print">
        <Link href="/auditorias">
          <Button variant="ghost" className="h-8">
            <ArrowLeft className="h-4 w-4" />
            {L.back}
          </Button>
        </Link>

        {/* Language selector for export */}
        <div className="flex rounded-md border border-border overflow-hidden h-8 text-xs font-medium">
          <button
            type="button"
            onClick={() => setExportLang("es")}
            className={`px-3 transition-colors ${
              exportLang === "es"
                ? "bg-forest text-white"
                : "bg-white text-ink-light hover:bg-background"
            }`}
          >
            ES
          </button>
          <button
            type="button"
            onClick={() => setExportLang("en")}
            className={`px-3 border-l border-border transition-colors ${
              exportLang === "en"
                ? "bg-forest text-white"
                : "bg-white text-ink-light hover:bg-background"
            }`}
          >
            EN
          </button>
        </div>

        <Button
          variant="secondary"
          loading={downloadingXls}
          onClick={handleDownloadExcel}
          className="h-8"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Excel
        </Button>

        <Button
          variant="secondary"
          loading={downloadingPdf}
          onClick={handleDownloadPdf}
          className="h-8"
        >
          <FileText className="h-4 w-4" />
          PDF
        </Button>

        {capaEligible.length > 0 && (
          <Button loading={sendingCapa} onClick={handleSendToCapa}>
            <Send className="h-4 w-4" />
            {L.sendToCapa} ({capaEligible.length})
          </Button>
        )}
      </div>

      {capaMessage && (
        <p className="text-xs text-sage no-print">{capaMessage}</p>
      )}

      <div id="audit-print-area" ref={printRef} className="bg-white space-y-6">
        <div className="border border-border rounded-md p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              {organizationLogoUrl && (
                <Image
                  src={organizationLogoUrl}
                  alt={L.companyLogo}
                  width={120}
                  height={40}
                  className="h-8 w-auto mb-3 object-contain"
                  unoptimized
                />
              )}
              <p className="text-xs font-mono text-ink-faint uppercase tracking-wider">
                {L.reportTitle}
              </p>
              <h1 className="text-lg font-display font-semibold text-ink mt-1">
                {audit.title}
              </h1>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge variant="neutral" showDot={false}>
                  {localAuditType(audit.audit_type, L)}
                </Badge>
                <Badge variant="success" showDot={false}>
                  {localizeStandard(audit.standard, exportLang)}
                </Badge>
              </div>
            </div>
            <ComplianceRing score={score} size={72} strokeWidth={5} />
          </div>

          <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 text-xs">
            <div>
              <dt className="text-ink-faint">{L.scheduledDate}</dt>
              <dd className="font-medium text-ink mt-0.5">
                {new Date(audit.scheduled_date).toLocaleDateString(locale)}
              </dd>
            </div>
            <div>
              <dt className="text-ink-faint">{L.completedDate}</dt>
              <dd className="font-medium text-ink mt-0.5">
                {audit.completed_date
                  ? new Date(audit.completed_date).toLocaleDateString(locale)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-faint">{L.auditor}</dt>
              <dd className="font-medium text-ink mt-0.5">
                {audit.auditor_name ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-faint">{L.scope}</dt>
              <dd className="font-medium text-ink mt-0.5">
                {audit.scope ?? "—"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="border border-border rounded-md p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-light mb-3">
              {L.summaryTitle}
            </h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-faint">{L.complies}</span>
                <span className="font-mono text-sage">{counts.complies}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-faint">{L.partial}</span>
                <span className="font-mono text-amber">{counts.partial}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-faint">{L.notComplies}</span>
                <span className="font-mono text-danger">{counts.not_complies}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-faint">{L.notApplicable}</span>
                <span className="font-mono text-ink-light">{counts.na}</span>
              </div>
            </div>
          </div>

          <div className="border border-border rounded-md p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-light mb-2 text-center">
              {L.sectionCompliance}
            </h2>
            <RadarChart data={radarData} emptyLabel={L.noRadarData} />
          </div>
        </div>

        {findings.length > 0 && (
          <div className="border border-border rounded-md overflow-hidden">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-light px-4 py-3 bg-zinc-50 border-b border-border">
              {L.findingsTitle} ({findings.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-ink-faint">
                    <th className="px-4 py-2 font-medium">{L.colType}</th>
                    <th className="px-4 py-2 font-medium">{L.colSection}</th>
                    <th className="px-4 py-2 font-medium">{L.colDescription}</th>
                    <th className="px-4 py-2 font-medium no-print">{L.colCapaStatus}</th>
                  </tr>
                </thead>
                <tbody>
                  {findings.map((f) => {
                    const item = f.checklist_item_id
                      ? itemMap.get(f.checklist_item_id)
                      : null;
                    return (
                      <tr key={f.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2">
                          <Badge
                            variant={
                              f.finding_type === "major_nc"
                                ? "danger"
                                : f.finding_type === "minor_nc"
                                  ? "warning"
                                  : "neutral"
                            }
                          >
                            {localFindingType(f.finding_type, L)}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-ink-light">
                          {item ? localizeSection(item.section, exportLang) : "—"}
                        </td>
                        <td className="px-4 py-2 text-ink">{f.description}</td>
                        <td className="px-4 py-2 no-print">
                          {f.capa_id ? (
                            <span className="text-sage">{L.ncCreatedCheck}</span>
                          ) : f.finding_type === "major_nc" ||
                            f.finding_type === "minor_nc" ? (
                            <span className="text-ink-faint">{L.capaPending}</span>
                          ) : (
                            <span className="text-ink-faint">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="border border-border rounded-md p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-light mb-4">
            {L.signaturesTitle}
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <Input
                label={L.auditor}
                value={auditorSign}
                onChange={(e) => setAuditorSign(e.target.value)}
                className="no-print-input"
              />
              <div className="hidden print:block mt-8 border-t border-ink pt-2">
                <p className="text-sm font-medium">{auditorSign || "________________"}</p>
                <p className="text-xs text-ink-faint mt-1">{L.auditor}</p>
              </div>
              <div className="no-print mt-4 h-12 border-b border-border" />
            </div>
            <div>
              <Input
                label={L.orgRepresentative}
                value={repSign}
                onChange={(e) => setRepSign(e.target.value)}
                className="no-print-input"
              />
              <div className="hidden print:block mt-8 border-t border-ink pt-2">
                <p className="text-sm font-medium">{repSign || "________________"}</p>
                <p className="text-xs text-ink-faint mt-1">{L.orgRepresentative}</p>
              </div>
              <div className="no-print mt-4 h-12 border-b border-border" />
            </div>
          </div>
          <p className="text-xs text-ink-faint mt-4 print-only">
            {L.dateLabel}: {new Date().toLocaleDateString(locale)}
          </p>
        </div>
      </div>
    </div>
  );
}
