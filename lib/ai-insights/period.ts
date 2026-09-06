const SANTIAGO = "America/Santiago";
const MS_HOUR = 3_600_000;

export function periodDateInSantiago(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SANTIAGO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function formatInsightDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return new Date(year, month - 1, day).toLocaleDateString("es", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function hoursUntilNextBriefing(generatedAt: string, now = new Date()): number {
  const next = new Date(generatedAt).getTime() + 24 * MS_HOUR;
  return Math.max(0, Math.ceil((next - now.getTime()) / MS_HOUR));
}

export function isInsightFresh(generatedAt: string, now = new Date()): boolean {
  return now.getTime() - new Date(generatedAt).getTime() < 24 * MS_HOUR;
}

export function daysBetween(fromIso: string, to = new Date()): number {
  const from = new Date(fromIso);
  const startFrom = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const startTo = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((startTo - startFrom) / 86_400_000);
}
