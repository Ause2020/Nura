const BRAND = {
  forest: "#1B4332",
  sage: "#40916C",
  ink: "#161210",
  muted: "#5C5550",
  border: "#E2DDD6",
};

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600&display=swap" rel="stylesheet" />
</head>
<body style="margin:0;padding:0;background:#F4F1EB;font-family:'Plus Jakarta Sans',system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F1EB;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background:#FFFFFF;border:1px solid ${BRAND.border};border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background:${BRAND.forest};padding:20px 24px;">
              <p style="margin:0;color:#FFFFFF;font-size:18px;font-weight:600;">Nura</p>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:12px;">Tu inocuidad, finalmente clara.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <h1 style="margin:0 0 12px;font-size:16px;color:${BRAND.ink};">${title}</h1>
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;border-top:1px solid ${BRAND.border};">
              <p style="margin:0;font-size:11px;color:${BRAND.muted};">
                Este mensaje fue enviado automáticamente por Nura.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function capaOverdueEmail(params: {
  ncNumber: string;
  description: string;
  dueDate: string;
  appUrl: string;
}): { subject: string; html: string } {
  const body = `
    <p style="margin:0 0 16px;font-size:14px;color:${BRAND.muted};line-height:1.5;">
      Tienes una No Conformidad vencida que requiere atención inmediata.
    </p>
    <table width="100%" style="background:#FEF2F2;border:1px solid #FECACA;border-radius:6px;padding:12px;margin-bottom:16px;">
      <tr><td style="font-size:13px;color:${BRAND.ink};"><strong>${params.ncNumber}</strong></td></tr>
      <tr><td style="font-size:12px;color:${BRAND.muted};padding-top:4px;">${params.description}</td></tr>
      <tr><td style="font-size:12px;color:#DC2626;padding-top:8px;font-family:monospace;">Venció: ${params.dueDate}</td></tr>
    </table>
    <a href="${params.appUrl}" style="display:inline-block;background:${BRAND.forest};color:#FFFFFF;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:13px;font-weight:600;">
      Ver en Nura
    </a>`;

  return {
    subject: `[Nura] NC vencida: ${params.ncNumber}`,
    html: layout("Tienes una No Conformidad vencida", body),
  };
}

export function prpMissedEmail(params: {
  programName: string;
  daysOverdue: number;
  appUrl: string;
}): { subject: string; html: string } {
  const body = `
    <p style="margin:0 0 16px;font-size:14px;color:${BRAND.muted};line-height:1.5;">
      El programa <strong>${params.programName}</strong> no ha sido ejecutado en
      <strong>${params.daysOverdue} días</strong> según su frecuencia programada.
    </p>
    <a href="${params.appUrl}" style="display:inline-block;background:${BRAND.forest};color:#FFFFFF;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:13px;font-weight:600;">
      Ejecutar checklist
    </a>`;

  return {
    subject: `[Nura] PRP pendiente: ${params.programName}`,
    html: layout("Programa PRP sin ejecutar", body),
  };
}

export function auditUpcomingEmail(params: {
  auditTitle: string;
  scheduledDate: string;
  daysUntil: number;
  appUrl: string;
}): { subject: string; html: string } {
  const body = `
    <p style="margin:0 0 16px;font-size:14px;color:${BRAND.muted};line-height:1.5;">
      Tienes una auditoría programada en <strong>${params.daysUntil} días</strong>.
    </p>
    <table width="100%" style="background:#D8F3DC;border:1px solid ${BRAND.sage}33;border-radius:6px;padding:12px;margin-bottom:16px;">
      <tr><td style="font-size:13px;color:${BRAND.ink};"><strong>${params.auditTitle}</strong></td></tr>
      <tr><td style="font-size:12px;color:${BRAND.muted};padding-top:4px;font-family:monospace;">Fecha: ${params.scheduledDate}</td></tr>
    </table>
    <a href="${params.appUrl}" style="display:inline-block;background:${BRAND.forest};color:#FFFFFF;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:13px;font-weight:600;">
      Ver auditoría
    </a>`;

  return {
    subject: `[Nura] Auditoría en ${params.daysUntil} días`,
    html: layout("Auditoría próxima", body),
  };
}

export function capaDueEmail(params: {
  ncNumber: string;
  description: string;
  dueDate: string;
  appUrl: string;
}): { subject: string; html: string } {
  const body = `
    <p style="margin:0 0 16px;font-size:14px;color:${BRAND.muted};line-height:1.5;">
      Una No Conformidad vence pronto y requiere seguimiento.
    </p>
    <table width="100%" style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:6px;padding:12px;margin-bottom:16px;">
      <tr><td style="font-size:13px;color:${BRAND.ink};"><strong>${params.ncNumber}</strong></td></tr>
      <tr><td style="font-size:12px;color:${BRAND.muted};padding-top:4px;">${params.description}</td></tr>
      <tr><td style="font-size:12px;color:#D97706;padding-top:8px;font-family:monospace;">Vence: ${params.dueDate}</td></tr>
    </table>
    <a href="${params.appUrl}" style="display:inline-block;background:${BRAND.forest};color:#FFFFFF;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:13px;font-weight:600;">
      Ver en Nura
    </a>`;

  return {
    subject: `[Nura] CAPA por vencer: ${params.ncNumber}`,
    html: layout("CAPA por vencer", body),
  };
}

export function auditCompletedEmail(params: {
  auditTitle: string;
  complianceScore: number;
  appUrl: string;
}): { subject: string; html: string } {
  const body = `
    <p style="margin:0 0 16px;font-size:14px;color:${BRAND.muted};line-height:1.5;">
      Se completó una auditoría en tu organización.
    </p>
    <table width="100%" style="background:#D8F3DC;border:1px solid ${BRAND.sage}33;border-radius:6px;padding:12px;margin-bottom:16px;">
      <tr><td style="font-size:13px;color:${BRAND.ink};"><strong>${params.auditTitle}</strong></td></tr>
      <tr><td style="font-size:12px;color:${BRAND.muted};padding-top:4px;">Cumplimiento: ${params.complianceScore}%</td></tr>
    </table>
    <a href="${params.appUrl}" style="display:inline-block;background:${BRAND.forest};color:#FFFFFF;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:13px;font-weight:600;">
      Ver informe
    </a>`;

  return {
    subject: `[Nura] Auditoría completada: ${params.auditTitle}`,
    html: layout("Auditoría completada", body),
  };
}

export function supplierDocExpiringEmail(params: {
  supplierName: string;
  docName: string;
  expiryDate: string;
  daysUntil: number;
  appUrl: string;
}): { subject: string; html: string } {
  const body = `
    <p style="margin:0 0 16px;font-size:14px;color:${BRAND.muted};line-height:1.5;">
      Un documento de homologación de proveedor vence en <strong>${params.daysUntil} días</strong>.
    </p>
    <table width="100%" style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:6px;padding:12px;margin-bottom:16px;">
      <tr><td style="font-size:13px;color:${BRAND.ink};"><strong>${params.supplierName}</strong></td></tr>
      <tr><td style="font-size:12px;color:${BRAND.muted};padding-top:4px;">${params.docName}</td></tr>
      <tr><td style="font-size:12px;color:#D97706;padding-top:8px;font-family:monospace;">Vence: ${params.expiryDate}</td></tr>
    </table>
    <a href="${params.appUrl}" style="display:inline-block;background:${BRAND.forest};color:#FFFFFF;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:13px;font-weight:600;">
      Ver proveedor
    </a>`;

  return {
    subject: `[Nura] Doc. proveedor por vencer: ${params.supplierName}`,
    html: layout("Documento de proveedor por vencer", body),
  };
}

export function supplierEvalOverdueEmail(params: {
  supplierName: string;
  criticality: string;
  nextEvaluationDate: string | null;
  appUrl: string;
}): { subject: string; html: string } {
  const body = `
    <p style="margin:0 0 16px;font-size:14px;color:${BRAND.muted};line-height:1.5;">
      Un proveedor <strong>${params.criticality}</strong> requiere evaluación de desempeño.
    </p>
    <table width="100%" style="background:#FEF2F2;border:1px solid #FECACA;border-radius:6px;padding:12px;margin-bottom:16px;">
      <tr><td style="font-size:13px;color:${BRAND.ink};"><strong>${params.supplierName}</strong></td></tr>
      <tr><td style="font-size:12px;color:#DC2626;padding-top:8px;font-family:monospace;">
        ${params.nextEvaluationDate ? `Venció: ${params.nextEvaluationDate}` : "Sin fecha programada"}
      </td></tr>
    </table>
    <a href="${params.appUrl}" style="display:inline-block;background:${BRAND.forest};color:#FFFFFF;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:13px;font-weight:600;">
      Evaluar proveedor
    </a>`;

  return {
    subject: `[Nura] Evaluación pendiente: ${params.supplierName}`,
    html: layout("Evaluación de proveedor vencida", body),
  };
}

export function complaintCriticalEmail(params: {
  complaintNumber: string;
  customerName: string;
  description: string;
  appUrl: string;
}): { subject: string; html: string } {
  const body = `
    <p style="margin:0 0 16px;font-size:14px;color:${BRAND.muted};line-height:1.5;">
      Se registró un <strong>reclamo de inocuidad crítica</strong> que requiere atención inmediata.
    </p>
    <table width="100%" style="background:#FEF2F2;border:1px solid #FECACA;border-radius:6px;padding:12px;margin-bottom:16px;">
      <tr><td style="font-size:13px;color:${BRAND.ink};"><strong>${params.complaintNumber}</strong> — ${params.customerName}</td></tr>
      <tr><td style="font-size:12px;color:${BRAND.muted};padding-top:4px;">${params.description}</td></tr>
    </table>
    <a href="${params.appUrl}" style="display:inline-block;background:${BRAND.forest};color:#FFFFFF;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:13px;font-weight:600;">
      Ver reclamo
    </a>`;

  return {
    subject: `[Nura] Reclamo crítico: ${params.complaintNumber}`,
    html: layout("Reclamo crítico de inocuidad", body),
  };
}

export function weeklySummaryEmail(params: {
  openNcs: number;
  overdueNcs: number;
  upcomingAudits: number;
  appUrl: string;
}): { subject: string; html: string } {
  const body = `
    <p style="margin:0 0 16px;font-size:14px;color:${BRAND.muted};line-height:1.5;">
      Resumen semanal de tu sistema de inocuidad en Nura.
    </p>
    <ul style="margin:0 0 16px;padding-left:20px;font-size:14px;color:${BRAND.muted};line-height:1.6;">
      <li><strong>${params.openNcs}</strong> NC(s) abiertas</li>
      <li><strong>${params.overdueNcs}</strong> NC(s) vencidas</li>
      <li><strong>${params.upcomingAudits}</strong> auditoría(s) próxima(s)</li>
    </ul>
    <a href="${params.appUrl}" style="display:inline-block;background:${BRAND.forest};color:#FFFFFF;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:13px;font-weight:600;">
      Abrir dashboard
    </a>`;

  return {
    subject: "[Nura] Resumen semanal de inocuidad",
    html: layout("Resumen semanal", body),
  };
}
