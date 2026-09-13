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

export function hoursUntilNextBriefing(now = new Date()): number {
  for (let hour = 1; hour <= 24; hour += 1) {
    const later = new Date(now.getTime() + hour * MS_HOUR);
    if (periodDateInSantiago(later) !== periodDateInSantiago(now)) {
      return hour;
    }
  }
  return 0;
}

/** Un insight es válido si pertenece al día calendario (Santiago), no a una ventana de 24 h. */
export function isInsightForPeriod(
  periodDate: string,
  now = new Date()
): boolean {
  return periodDate === periodDateInSantiago(now);
}

export function daysBetween(fromIso: string, to = new Date()): number {
  const from = new Date(fromIso);
  const startFrom = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const startTo = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((startTo - startFrom) / 86_400_000);
}
