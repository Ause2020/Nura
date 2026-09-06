import type { DayPoint } from "@/components/production-records/historico-charts";

export function buildHistoricoDays(
  submissions: { submitted_at: string; has_deviation: boolean; status: string }[],
  days = 14
): DayPoint[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const points: DayPoint[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(today.getDate() - i);
    const next = new Date(day);
    next.setDate(day.getDate() + 1);
    const key = day.toISOString().slice(0, 10);
    const rows = submissions.filter((s) => {
      const t = new Date(s.submitted_at).getTime();
      return t >= day.getTime() && t < next.getTime();
    });
    const deviations = rows.filter(
      (s) => s.has_deviation || s.status === "deviation"
    ).length;
    points.push({
      date: key,
      total: rows.length,
      ok: rows.length - deviations,
      deviations,
    });
  }

  return points;
}
