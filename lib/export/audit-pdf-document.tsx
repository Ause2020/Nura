/**
 * @react-pdf/renderer document for audit reports.
 * Only used server-side (API route). Never import in client components.
 */
import {
  Document,
  Image,
  Line,
  Page,
  Polygon,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import {
  RADAR_LEVELS,
  radarPoint,
  radarPolygonPoints,
  truncateRadarLabel,
} from "@/lib/audit/radar";
import { getSectionScores } from "@/lib/audit/utils";
import {
  dateLocale,
  localizeSection,
  localizeStandard,
} from "@/lib/export/audit-i18n";
import {
  getAuditLabels,
  localAuditType,
  localFindingType,
  type ExportLang,
} from "@/lib/export/labels";
import type { Audit, AuditChecklistItem, AuditFinding } from "@/types/database";

// ─── Styles ──────────────────────────────────────────────────────────────────

const C = {
  forest: "#2D6A4F",
  sage: "#52B788",
  amber: "#D4A017",
  danger: "#DC2626",
  ink: "#1A1A2E",
  inkLight: "#6B7280",
  border: "#E5E7EB",
  bgLight: "#F9FAFB",
  white: "#FFFFFF",
};

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: C.ink,
    padding: 36,
    backgroundColor: C.white,
  },
  // Header
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  logo: { width: 80, height: 24, objectFit: "contain" },
  headerRight: { alignItems: "flex-end" },
  headerLabel: { fontSize: 7, color: C.inkLight, textTransform: "uppercase", letterSpacing: 1 },
  headerTitle: { fontSize: 14, fontFamily: "Helvetica-Bold", color: C.forest, marginTop: 2 },
  headerDate: { fontSize: 7, color: C.inkLight, marginTop: 2 },
  // Meta grid
  metaGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 14, gap: 8 },
  metaCell: { width: "48%" },
  metaLabel: { fontSize: 7, color: C.inkLight, textTransform: "uppercase", letterSpacing: 0.5 },
  metaValue: { fontSize: 9, color: C.ink, marginTop: 1, fontFamily: "Helvetica-Bold" },
  // Score badge
  scoreBadge: {
    backgroundColor: C.forest,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  scoreText: { fontSize: 16, fontFamily: "Helvetica-Bold", color: C.white },
  scoreLabel: { fontSize: 7, color: C.white, marginTop: 1 },
  // Section heading
  sectionHeading: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.inkLight,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingBottom: 3,
  },
  // Summary row
  summaryRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  summaryCell: {
    flex: 1,
    backgroundColor: C.bgLight,
    borderRadius: 4,
    padding: 8,
    alignItems: "center",
  },
  summaryCount: { fontSize: 16, fontFamily: "Helvetica-Bold", color: C.forest },
  summaryLabel: { fontSize: 7, color: C.inkLight, marginTop: 2 },
  // Table
  table: { marginBottom: 8 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: C.bgLight,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  tableRowAlt: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: 4,
    paddingHorizontal: 6,
    backgroundColor: C.bgLight,
  },
  thNum: { width: 24, fontSize: 7, fontFamily: "Helvetica-Bold", color: C.inkLight },
  thType: { width: 70, fontSize: 7, fontFamily: "Helvetica-Bold", color: C.inkLight },
  thSection: { width: 80, fontSize: 7, fontFamily: "Helvetica-Bold", color: C.inkLight },
  thDesc: { flex: 1, fontSize: 7, fontFamily: "Helvetica-Bold", color: C.inkLight },
  thCapa: { width: 60, fontSize: 7, fontFamily: "Helvetica-Bold", color: C.inkLight },
  tdNum: { width: 24, fontSize: 8 },
  tdType: { width: 70, fontSize: 8 },
  tdSection: { width: 80, fontSize: 8, color: C.inkLight },
  tdDesc: { flex: 1, fontSize: 8 },
  tdCapa: { width: 60, fontSize: 8 },
  // Pill badges in PDF
  pillMajor: { backgroundColor: "#FEE2E2", borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 },
  pillMinor: { backgroundColor: "#FEF3C7", borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 },
  pillObs: { backgroundColor: "#F3F4F6", borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 },
  pillTextMajor: { fontSize: 7, color: "#991B1B", fontFamily: "Helvetica-Bold" },
  pillTextMinor: { fontSize: 7, color: "#92400E", fontFamily: "Helvetica-Bold" },
  pillTextObs: { fontSize: 7, color: C.inkLight },
  // Signatures
  signRow: { flexDirection: "row", gap: 24, marginTop: 8 },
  signCell: { flex: 1 },
  signLine: { borderBottomWidth: 1, borderBottomColor: C.ink, marginBottom: 4, height: 20 },
  signLabel: { fontSize: 7, color: C.inkLight },
  signName: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  // Footer
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 4,
  },
  footerText: { fontSize: 7, color: C.inkLight },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null, lang: ExportLang): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(dateLocale(lang));
}

function PdfRadarChart({
  data,
  size = 220,
}: {
  data: { section: string; score: number }[];
  size?: number;
}) {
  if (data.length < 3) return null;

  const center = size / 2;
  const maxRadius = size / 2 - 28;
  const scorePoints = radarPolygonPoints(
    data.map((d) => d.score),
    center,
    maxRadius
  );

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {RADAR_LEVELS.map((level) => (
        <Polygon
          key={level}
          points={radarPolygonPoints(
            data.map(() => level),
            center,
            maxRadius
          )}
          fill="none"
          stroke={C.border}
          strokeWidth={1}
        />
      ))}
      {data.map((_, i) => {
        const [x, y] = radarPoint(i, 100, data.length, center, maxRadius);
        return (
          <Line
            key={`axis-${i}`}
            x1={center}
            y1={center}
            x2={x}
            y2={y}
            stroke={C.border}
            strokeWidth={1}
          />
        );
      })}
      <Polygon
        points={scorePoints}
        fill={C.sage}
        fillOpacity={0.22}
        stroke={C.sage}
        strokeWidth={2}
      />
      {data.map((d, i) => {
        const [x, y] = radarPoint(i, 118, data.length, center, maxRadius);
        return (
          <Text
            key={`label-${i}`}
            x={x - 18}
            y={y}
            style={{ fontSize: 6, color: C.inkLight }}
          >
            {truncateRadarLabel(d.section, 12)}
          </Text>
        );
      })}
    </Svg>
  );
}

function findingPill(type: AuditFinding["finding_type"], label: string) {
  if (type === "major_nc") {
    return (
      <View style={s.pillMajor}>
        <Text style={s.pillTextMajor}>{label}</Text>
      </View>
    );
  }
  if (type === "minor_nc") {
    return (
      <View style={s.pillMinor}>
        <Text style={s.pillTextMinor}>{label}</Text>
      </View>
    );
  }
  return (
    <View style={s.pillObs}>
      <Text style={s.pillTextObs}>{label}</Text>
    </View>
  );
}

// ─── Document component ───────────────────────────────────────────────────────

interface AuditPdfDocumentProps {
  audit: Audit;
  items: AuditChecklistItem[];
  findings: AuditFinding[];
  organizationName: string;
  organizationLogoImage: { data: Uint8Array; format: "png" | "jpg" } | null;
  lang: ExportLang;
  auditorSignature?: string;
  orgRepSignature?: string;
}

export function AuditPdfDocument({
  audit,
  items,
  findings,
  organizationName,
  organizationLogoImage,
  lang,
  auditorSignature,
  orgRepSignature,
}: AuditPdfDocumentProps) {
  const L = getAuditLabels(lang);
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const score = Number(audit.compliance_score ?? 0);

  const counts = {
    complies: items.filter((i) => i.result === "complies").length,
    partial: items.filter((i) => i.result === "partial").length,
    notComplies: items.filter((i) => i.result === "not_complies").length,
    na: items.filter((i) => i.result === "na").length,
  };

  const radarData = getSectionScores(items).map((row) => ({
    section: localizeSection(row.section, lang),
    score: row.score,
  }));

  const now = fmtDate(new Date().toISOString(), lang);

  return (
    <Document
      title={`${L.reportTitle} — ${audit.title}`}
      author={organizationName}
      language={lang}
    >
      <Page size="A4" style={s.page}>
        {/* ── Header ── */}
        <View style={s.headerRow} fixed>
          <View>
            {organizationLogoImage && (
              <Image
                src={{
                  data: Buffer.from(organizationLogoImage.data),
                  format: organizationLogoImage.format,
                }}
                style={s.logo}
              />
            )}
            <Text style={s.headerDate}>{organizationName}</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.headerLabel}>{L.auditReport}</Text>
            <Text style={s.headerDate}>
              {L.generatedOn}: {now}
            </Text>
          </View>
        </View>

        {/* ── Audit title + score ── */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontFamily: "Helvetica-Bold", color: C.forest }}>
              {audit.title}
            </Text>
            <Text style={{ fontSize: 8, color: C.inkLight, marginTop: 2 }}>
              {localAuditType(audit.audit_type, L)} · {localizeStandard(audit.standard, lang)}
            </Text>
          </View>
          <View style={s.scoreBadge}>
            <Text style={s.scoreText}>{score}%</Text>
            <Text style={s.scoreLabel}>{L.complianceScore}</Text>
          </View>
        </View>

        {/* ── Meta grid ── */}
        <View style={s.metaGrid}>
          <View style={s.metaCell}>
            <Text style={s.metaLabel}>{L.scheduledDate}</Text>
            <Text style={s.metaValue}>{fmtDate(audit.scheduled_date, lang)}</Text>
          </View>
          <View style={s.metaCell}>
            <Text style={s.metaLabel}>{L.completedDate}</Text>
            <Text style={s.metaValue}>{fmtDate(audit.completed_date, lang)}</Text>
          </View>
          <View style={s.metaCell}>
            <Text style={s.metaLabel}>{L.auditor}</Text>
            <Text style={s.metaValue}>{audit.auditor_name ?? "—"}</Text>
          </View>
          <View style={s.metaCell}>
            <Text style={s.metaLabel}>{L.scope}</Text>
            <Text style={s.metaValue}>{audit.scope ?? "—"}</Text>
          </View>
        </View>

        {/* ── Summary ── */}
        <Text style={s.sectionHeading}>{L.summaryTitle}</Text>
        <View style={s.summaryRow}>
          <View style={s.summaryCell}>
            <Text style={[s.summaryCount, { color: C.forest }]}>{counts.complies}</Text>
            <Text style={s.summaryLabel}>{L.complies}</Text>
          </View>
          <View style={s.summaryCell}>
            <Text style={[s.summaryCount, { color: C.amber }]}>{counts.partial}</Text>
            <Text style={s.summaryLabel}>{L.partial}</Text>
          </View>
          <View style={s.summaryCell}>
            <Text style={[s.summaryCount, { color: C.danger }]}>{counts.notComplies}</Text>
            <Text style={s.summaryLabel}>{L.notComplies}</Text>
          </View>
          <View style={s.summaryCell}>
            <Text style={[s.summaryCount, { color: C.inkLight }]}>{counts.na}</Text>
            <Text style={s.summaryLabel}>{L.notApplicable}</Text>
          </View>
        </View>

        {radarData.length >= 3 && (
          <>
            <Text style={s.sectionHeading}>{L.sectionCompliance}</Text>
            <View style={{ alignItems: "center", marginBottom: 8 }}>
              <PdfRadarChart data={radarData} />
            </View>
          </>
        )}

        {/* ── Findings table ── */}
        {findings.length > 0 && (
          <>
            <Text style={s.sectionHeading}>
              {L.findingsTitle} ({findings.length})
            </Text>
            <View style={s.table}>
              <View style={s.tableHeader}>
                <Text style={s.thNum}>{L.colNumber}</Text>
                <Text style={s.thType}>{L.colType}</Text>
                <Text style={s.thSection}>{L.colSection}</Text>
                <Text style={s.thDesc}>{L.colDescription}</Text>
                <Text style={s.thCapa}>{L.colCapaStatus}</Text>
              </View>
              {findings.map((f, idx) => {
                const item = f.checklist_item_id
                  ? itemMap.get(f.checklist_item_id)
                  : null;
                const Row = idx % 2 === 0 ? s.tableRow : s.tableRowAlt;
                const capaStatus = f.capa_id
                  ? L.capaCreated
                  : f.finding_type === "major_nc" || f.finding_type === "minor_nc"
                  ? L.capaPending
                  : L.notApplicableShort;

                return (
                  <View key={f.id} style={Row} wrap={false}>
                    <Text style={s.tdNum}>{idx + 1}</Text>
                    <View style={s.tdType}>
                      {findingPill(f.finding_type, localFindingType(f.finding_type, L))}
                    </View>
                    <Text style={s.tdSection}>
                      {item ? localizeSection(item.section, lang) : "—"}
                    </Text>
                    <Text style={s.tdDesc}>{f.description}</Text>
                    <Text style={s.tdCapa}>{capaStatus}</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ── Signatures ── */}
        <Text style={s.sectionHeading}>{L.signaturesTitle}</Text>
        <View style={s.signRow}>
          <View style={s.signCell}>
            <View style={s.signLine} />
            {auditorSignature && (
              <Text style={s.signName}>{auditorSignature}</Text>
            )}
            <Text style={s.signLabel}>{L.auditorSignature}</Text>
          </View>
          <View style={s.signCell}>
            <View style={s.signLine} />
            {orgRepSignature && (
              <Text style={s.signName}>{orgRepSignature}</Text>
            )}
            <Text style={s.signLabel}>{L.orgRepresentative}</Text>
          </View>
        </View>

        {/* ── Footer ── */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>{organizationName}</Text>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
