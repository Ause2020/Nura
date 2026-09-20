"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  BrainCircuit,
  FileText,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NOTIFICATION_TYPE_LABELS } from "@/lib/notifications/constants";
import { isSafeNotificationLink } from "@/lib/notifications/safe-link";
import type { NotificationRow } from "@/lib/notifications";
import { formatRelativeTime } from "@/lib/dashboard/utils";
import { cn } from "@/lib/utils";
import type { NotificationType } from "@/lib/notifications/constants";

const TYPE_ICONS: Record<NotificationType, typeof Bell> = {
  capa_due: AlertTriangle,
  capa_overdue: AlertTriangle,
  audit_upcoming: Search,
  nc_new: AlertTriangle,
  document_read_required: FileText,
  daily_insight: BrainCircuit,
  system: Bell,
};

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
  notifications: NotificationRow[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}

export function NotificationPanel({
  open,
  onClose,
  notifications,
  onMarkRead,
  onMarkAllRead,
}: NotificationPanelProps) {
  if (!open) return null;

  const unread = notifications.filter((n) => !n.read);

  return (
    <>
      <div
        className="fixed inset-0 bg-ink/20 z-40"
        onClick={onClose}
        aria-hidden
      />
      <aside className="fixed top-0 right-0 h-full w-full max-w-sm bg-white border-l border-border shadow-sm z-50 flex flex-col">
        <div className="flex items-center justify-between px-4 h-14 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-ink">Notificaciones</h2>
            {unread.length > 0 && (
              <p className="text-xs text-ink-faint">{unread.length} sin leer</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unread.length > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="text-xs text-sage hover:text-forest transition-colors duration-150"
              >
                Marcar todas
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-background"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4 text-ink-light" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="text-sm text-ink-faint text-center py-12 px-4">
              No tienes notificaciones
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {notifications.map((notification) => {
                const Icon = TYPE_ICONS[notification.type] ?? Bell;
                const content = (
                  <>
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                        notification.read ? "bg-zinc-50" : "bg-sage-light"
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4",
                          notification.read ? "text-ink-faint" : "text-forest"
                        )}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          "text-sm leading-snug",
                          notification.read
                            ? "text-ink-light"
                            : "text-ink font-medium"
                        )}
                      >
                        {notification.title}
                      </p>
                      <p className="text-xs text-ink-faint mt-0.5 line-clamp-2">
                        {notification.message}
                      </p>
                      <p className="text-xs text-ink-faint mt-1">
                        {formatRelativeTime(notification.created_at)}
                        {!notification.read && (
                          <span className="ml-2 text-sage">
                            · {NOTIFICATION_TYPE_LABELS[notification.type]}
                          </span>
                        )}
                      </p>
                    </div>
                  </>
                );

                return (
                  <li key={notification.id}>
                    {isSafeNotificationLink(notification.link) &&
                    notification.link ? (
                      <Link
                        href={notification.link}
                        onClick={() => {
                          onMarkRead(notification.id);
                          onClose();
                        }}
                        className="flex gap-3 px-4 py-3 hover:bg-background transition-colors duration-150"
                      >
                        {content}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onMarkRead(notification.id)}
                        className="flex gap-3 px-4 py-3 w-full text-left hover:bg-background transition-colors duration-150"
                      >
                        {content}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="p-4 border-t border-border">
          <Button variant="secondary" className="w-full" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </aside>
    </>
  );
}
