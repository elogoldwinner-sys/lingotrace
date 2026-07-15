import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bell, Award, CalendarCheck, NotebookPen, Settings as SettingsIcon } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import {
  subscribeToNotifications,
  markNotificationRead,
} from "../lib/services/notificationsService";
import type { NotificationRecord } from "../types";
import EmptyState from "../components/common/EmptyState";
import Spinner from "../components/common/Spinner";

const ICONS: Record<NotificationRecord["type"], React.ReactNode> = {
  badge: <Award size={16} className="text-gold" />,
  points: <Award size={16} className="text-gold" />,
  note: <NotebookPen size={16} className="text-navy" />,
  attendance: <CalendarCheck size={16} className="text-navy" />,
  system: <SettingsIcon size={16} className="text-cream-600" />,
};

export default function NotificationsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToNotifications(
      user.uid,
      (data) => {
        setNotifications(data);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsubscribe;
  }, [user]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-navy flex items-center gap-2">
        <Bell size={22} />
        {t("nav.notifications")}
      </h1>

      {loading ? (
        <Spinner />
      ) : notifications.length === 0 ? (
        <EmptyState message="No notifications yet." icon="🔔" />
      ) : (
        <div className="card divide-y divide-cream-400">
          {notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => !n.read && markNotificationRead(n.id)}
              className={`w-full flex items-start gap-3 px-5 py-4 text-left transition-colors ${
                n.read ? "opacity-70" : "bg-gold-50/40"
              }`}
            >
              <div className="mt-0.5">{ICONS[n.type]}</div>
              <div>
                <p className="font-medium text-navy">{n.title}</p>
                <p className="text-sm text-cream-600">{n.body}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
