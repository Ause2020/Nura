import Link from "next/link";
import {
  AlertTriangle,
  ClipboardList,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { ActivityItem } from "@/lib/dashboard/utils";
import { formatRelativeTime } from "@/lib/dashboard/utils";

const ICONS = {
  registro: ClipboardList,
  audit: Search,
  nc: AlertTriangle,
  capa: ShieldCheck,
};

interface ActivityFeedProps {
  items: ActivityItem[];
}

export function ActivityFeed({ items }: ActivityFeedProps) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-ink-faint py-6 text-center">
        Sin actividad reciente
      </p>
    );
  }

  return (
    <div className="divide-y divide-border">
      {items.map((item) => {
        const Icon = ICONS[item.type];
        return (
          <Link
            key={item.id}
            href={item.href}
            className="flex items-start gap-3 py-3 hover:bg-background transition-colors duration-150 -mx-1 px-1 rounded-md"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-50">
              <Icon className="h-3.5 w-3.5 text-ink-light" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-ink leading-snug">{item.description}</p>
              <p className="text-xs text-ink-faint mt-0.5">
                {formatRelativeTime(item.timestamp)}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
