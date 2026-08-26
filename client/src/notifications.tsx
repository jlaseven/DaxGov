import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Star } from "lucide-react";
import { api } from "./api";
import { badgeClass } from "./theme";

export const WATCHABLE_TYPES = [
  "documents",
  "opir-actions",
  "audit-findings",
  "objectives",
  "initiatives",
  "tpsa-records",
  "isra-risks",
  "information-assets",
  "orca",
  "kri-records",
] as const;

export type WatchableType = (typeof WATCHABLE_TYPES)[number];

export type NoticeFlag =
  | "important"
  | "overdue"
  | "due-soon"
  | "high-risk"
  | "at-risk"
  | "attention";

export type Notice = {
  key: string;
  entityType: WatchableType;
  entityId: string;
  title: string;
  detail: string;
  href: string;
  flags: NoticeFlag[];
  severity: "high" | "medium" | "low";
  dueDate: string | null;
  unread: boolean;
};

const FLAG_LABEL: Record<NoticeFlag, string> = {
  important: "Important",
  overdue: "Overdue",
  "due-soon": "Due soon",
  "high-risk": "High risk",
  "at-risk": "At risk",
  attention: "Needs attention",
};

type NotificationsState = {
  notices: Notice[];
  unread: number;
  isWatched: (entityType: string, entityId: number | string) => boolean;
  toggleWatch: (entityType: WatchableType, entityId: number | string) => Promise<void>;
  markRead: (keys: string[]) => Promise<void>;
  markAllRead: () => Promise<void>;
  refresh: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsState | null>(null);

export function isWatchableType(value: string): value is WatchableType {
  return (WATCHABLE_TYPES as readonly string[]).includes(value);
}

export function watchKey(entityType: string, entityId: number | string) {
  return `${entityType}:${entityId}`;
}

function formatDue(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const [watchlist, inbox] = await Promise.all([
        api("/watchlist"),
        api("/notifications"),
      ]);
      setWatched(
        new Set(
          (watchlist.data || []).map((item: { entityType: string; entityId: string }) =>
            watchKey(item.entityType, item.entityId),
          ),
        ),
      );
      setNotices(inbox.data || []);
      setUnread(inbox.meta?.unread || 0);
    } catch {
      /* Keep the last successful inbox if a poll fails. */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const isWatched = useCallback(
    (entityType: string, entityId: number | string) =>
      watched.has(watchKey(entityType, entityId)),
    [watched],
  );

  const toggleWatch = useCallback(
    async (entityType: WatchableType, entityId: number | string) => {
      const key = watchKey(entityType, entityId);
      const currently = watched.has(key);
      setWatched((current) => {
        const next = new Set(current);
        if (currently) next.delete(key);
        else next.add(key);
        return next;
      });
      try {
        if (currently) {
          await api(
            `/watchlist/${encodeURIComponent(entityType)}/${encodeURIComponent(String(entityId))}`,
            { method: "DELETE" },
          );
        } else {
          await api("/watchlist", {
            method: "POST",
            body: JSON.stringify({ entityType, entityId }),
          });
        }
        await refresh();
      } catch {
        await refresh();
      }
    },
    [refresh, watched],
  );

  const markRead = useCallback(
    async (keys: string[]) => {
      if (!keys.length) return;
      setNotices((current) =>
        current.map((notice) =>
          keys.includes(notice.key) ? { ...notice, unread: false } : notice,
        ),
      );
      setUnread((count) =>
        Math.max(0, count - notices.filter((item) => item.unread && keys.includes(item.key)).length),
      );
      try {
        await api("/notifications/read", {
          method: "POST",
          body: JSON.stringify({ keys }),
        });
        await refresh();
      } catch {
        await refresh();
      }
    },
    [notices, refresh],
  );

  const markAllRead = useCallback(async () => {
    setNotices((current) => current.map((notice) => ({ ...notice, unread: false })));
    setUnread(0);
    try {
      await api("/notifications/read", {
        method: "POST",
        body: JSON.stringify({ all: true }),
      });
      await refresh();
    } catch {
      await refresh();
    }
  }, [refresh]);

  const value = useMemo(
    () => ({
      notices,
      unread,
      isWatched,
      toggleWatch,
      markRead,
      markAllRead,
      refresh,
    }),
    [isWatched, markAllRead, markRead, notices, refresh, toggleWatch, unread],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context)
    throw new Error("useNotifications must be used within NotificationsProvider");
  return context;
}

export function ImportanceToggle({
  entityType,
  entityId,
}: {
  entityType: WatchableType;
  entityId: number | string;
}) {
  const { isWatched, toggleWatch } = useNotifications();
  const on = isWatched(entityType, entityId);
  const onClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    void toggleWatch(entityType, entityId);
  };
  return (
    <button
      type="button"
      className={on ? "importance-toggle on" : "importance-toggle"}
      aria-pressed={on}
      aria-label={on ? "Remove importance" : "Mark as important"}
      title={on ? "Remove importance" : "Mark as important"}
      onClick={onClick}
    >
      <Star />
    </button>
  );
}

export function NotificationBell() {
  const { notices, unread, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="notice-bell" ref={root}>
      <button
        type="button"
        className="notice-bell-btn"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell />
        {unread > 0 && (
          <span className="notice-count">{unread > 99 ? "99+" : unread}</span>
        )}
      </button>
      {open && (
        <div className="notice-panel" role="dialog" aria-label="Notifications">
          <div className="notice-panel-head">
            <strong>Notifications</strong>
            <button
              type="button"
              disabled={!unread}
              onClick={() => void markAllRead()}
            >
              Mark all read
            </button>
          </div>
          {notices.length ? (
            <ul className="notice-list">
              {notices.map((notice) => (
                <li key={notice.key}>
                  <button
                    type="button"
                    className={
                      notice.unread
                        ? `notice-item unread severity-${notice.severity}`
                        : `notice-item severity-${notice.severity}`
                    }
                    onClick={() => {
                      void markRead([notice.key]);
                      setOpen(false);
                      navigate(notice.href);
                    }}
                  >
                    <span className="notice-title">{notice.title}</span>
                    <span className="notice-detail">{notice.detail}</span>
                    <span className="notice-flags">
                      {notice.flags.map((flag) => (
                        <span key={flag} className={badgeClass(FLAG_LABEL[flag])}>
                          {FLAG_LABEL[flag]}
                        </span>
                      ))}
                    </span>
                    {formatDue(notice.dueDate) && (
                      <span className="notice-due">Due {formatDue(notice.dueDate)}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="notice-empty">No items need attention right now.</p>
          )}
        </div>
      )}
    </div>
  );
}
