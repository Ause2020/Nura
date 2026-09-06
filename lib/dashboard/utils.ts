const MS_DAY = 86400000;

export interface DashboardTask {
  id: string;
  type: "registro" | "audit" | "capa";
  title: string;
  subtitle: string;
  href: string;
  urgent: boolean;
}

export interface OperationalMetrics {
  haccpComplete: number;
  haccpTotal: number;
  recordsTemplatesActive: number;
  recordsSubmissionsMonth: number;
  openNcs: number;
  criticalOrOverdueNcs: number;
  auditsScheduledMonth: number;
  auditsCompletedMonth: number;
  systemScore: number;
  overdueCapas: number;
}

export interface ExecutiveKpi {
  label: string;
  value: string;
  trend: "up" | "down" | "flat";
  trendLabel: string;
}

export interface MonthlyScorePoint {
  month: string;
  score: number;
}

export interface NcOriginCount {
  origin: string;
  label: string;
  count: number;
}

export interface ActivityItem {
  id: string;
  type: "registro" | "audit" | "nc" | "capa";
  description: string;
  timestamp: string;
  href: string;
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

export function computeSystemScore(input: {
  haccpAvgCompletion: number;
  recordsCompliancePct: number;
  openNcs: number;
  overdueNcs: number;
  auditsCompleted: number;
  auditsScheduled: number;
}): number {
  const haccpScore = input.haccpAvgCompletion;
  const recordsScore = input.recordsCompliancePct;
  const ncPenalty = Math.min(input.openNcs * 12 + input.overdueNcs * 8, 100);
  const ncScore = Math.max(0, 100 - ncPenalty);
  const auditScore =
    input.auditsScheduled > 0
      ? (input.auditsCompleted / input.auditsScheduled) * 100
      : 100;

  return Math.round(
    haccpScore * 0.3 +
      recordsScore * 0.25 +
      ncScore * 0.25 +
      auditScore * 0.2
  );
}

export function computeMonthlyTrend(
  audits: { completed_date: string | null; compliance_score: number | null }[],
  ncs: { created_at: string }[]
): MonthlyScorePoint[] {
  const points: MonthlyScorePoint[] = [];
  const now = new Date();

  for (let i = 5; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    const monthLabel = monthDate.toLocaleDateString("es", {
      month: "short",
    });

    const monthAudits = audits.filter((a) => {
      if (!a.completed_date) return false;
      const d = new Date(a.completed_date);
      return d >= monthDate && d <= monthEnd;
    });

    const monthNcs = ncs.filter((nc) => {
      const d = new Date(nc.created_at);
      return d >= monthDate && d <= monthEnd;
    });

    let score: number;
    if (monthAudits.length > 0) {
      const avg =
        monthAudits.reduce(
          (sum, a) => sum + Number(a.compliance_score ?? 0),
          0
        ) / monthAudits.length;
      score = Math.round(avg);
    } else {
      score = Math.max(35, 100 - monthNcs.length * 10);
    }

    points.push({ month: monthLabel, score });
  }

  return points;
}

export function computeAvgCapaClosureDays(
  ncs: { detected_at: string; closed_at: string | null; status: string }[]
): number | null {
  const closed = ncs.filter((nc) => nc.closed_at && nc.status === "closed");
  if (closed.length === 0) return null;

  const totalDays = closed.reduce((sum, nc) => {
    const start = new Date(nc.detected_at).getTime();
    const end = new Date(nc.closed_at!).getTime();
    return sum + Math.max(1, Math.round((end - start) / MS_DAY));
  }, 0);

  return Math.round(totalDays / closed.length);
}

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} días`;
  return new Date(iso).toLocaleDateString("es", {
    day: "numeric",
    month: "short",
  });
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

export function scoreColor(score: number): string {
  if (score >= 80) return "#40916C";
  if (score >= 60) return "#B7791F";
  return "#DC2626";
}
