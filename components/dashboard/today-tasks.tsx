import Link from "next/link";
import {
  ArrowRight,
  ClipboardList,
  Search,
  AlertTriangle,
} from "lucide-react";
import type { DashboardTask } from "@/lib/dashboard/utils";
import { cn } from "@/lib/utils";

const ICONS = {
  registro: ClipboardList,
  audit: Search,
  capa: AlertTriangle,
};

interface TodayTasksProps {
  tasks: DashboardTask[];
}

export function TodayTasks({ tasks }: TodayTasksProps) {
  if (tasks.length === 0) {
    return (
      <div className="bg-white rounded-md border border-border px-4 py-6 text-center">
        <p className="text-sm text-ink-light">No hay tareas urgentes para hoy</p>
        <p className="text-xs text-ink-faint mt-1">
          Revisa registros, auditorías y CAPAs programados
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-md border border-border divide-y divide-border">
      {tasks.map((task) => {
        const Icon = ICONS[task.type];
        return (
          <Link
            key={task.id}
            href={task.href}
            className="flex items-center gap-3 px-4 py-3 hover:bg-background transition-colors duration-150"
          >
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                task.urgent ? "bg-red-50 text-danger" : "bg-sage-light text-forest"
              )}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink truncate">{task.title}</p>
              <p className="text-xs text-ink-faint">{task.subtitle}</p>
            </div>
            <ArrowRight className="h-4 w-4 text-ink-faint shrink-0" />
          </Link>
        );
      })}
    </div>
  );
}
