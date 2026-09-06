export interface RadarDatum {
  section: string;
  score: number;
}

export function radarPoint(
  index: number,
  value: number,
  total: number,
  center: number,
  maxRadius: number
): [number, number] {
  const angle = ((2 * Math.PI) / total) * index - Math.PI / 2;
  const r = (value / 100) * maxRadius;
  return [center + r * Math.cos(angle), center + r * Math.sin(angle)];
}

export function radarPolygonPoints(
  values: number[],
  center: number,
  maxRadius: number
): string {
  return values
    .map((value, index) => {
      const [x, y] = radarPoint(index, value, values.length, center, maxRadius);
      return `${x},${y}`;
    })
    .join(" ");
}

export function truncateRadarLabel(section: string, max = 14): string {
  return section.length > max ? `${section.slice(0, max - 1)}…` : section;
}

export const RADAR_LEVELS = [25, 50, 75, 100] as const;
