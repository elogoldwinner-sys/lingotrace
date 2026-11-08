import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Bell, BellCheck, BellOff, Sparkles } from "lucide-react";
import {
  isPushSupported,
  getNotificationPermission,
  requestNotificationPermission,
  sendLocalNotification,
  saveUserPushSubscription,
} from "../../lib/services/pushNotificationService";

interface NotificationOptInProps {
  userId?: string;
    compact?: boolean;
}

export default function NotificationOptIn({
  userId,
  compact = false,
}: NotificationOptInProps) {
  const { t } = useTranslation();
  const [permission, setPermission] = useState<NotificationPermission>(getNotificationPermission);
  const [loading, setLoading] = useState(false);
  const [tested, setTested] = useState(false);

  if (!isPushSupported()) return null;

  async function handleEnable() {
    setLoading(true);
    const result = await requestNotificationPermission();
    setPermission(result);
    setLoading(false);

    if (result === "granted") {
      // Send welcoming notification immediately
      await sendLocalNotification(t("notifications.welcomeTitle"), {
        body: t("notifications.welcomeBody"),
      });

      // Save to Firestore if user ID available
      if (userId) {
        await saveUserPushSubscription("parents", userId);
      }
    }
  }

  async function handleTestNotification() {
    await sendLocalNotification(t("app.name"), {
      body: t("notifications.testSuccess"),
    });
    setTested(true);
    setTimeout(() => setTested(false), 3000);
  }

  // Compact variant (e.g. for Topbar or headers)
  if (compact) {
    if (permission === "granted") {
      return (
        <button
          type="button"
          onClick={handleTestNotification}
          title={t("notifications.testBtn")}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-50 text-green-700 hover:bg-green-100 transition"
        >
          <BellCheck size={18} />
        </button>
      );
    }
    if (permission === "denied") return null;

    return (
      <button
        type="button"
        onClick={handleEnable}
        disabled={loading}
        title={t("notifications.enableBtn")}
        className="flex h-9 items-center gap-1.5 rounded-xl border border-gold/40 bg-gold-50 px-2.5 text-xs font-semibold text-navy hover:bg-gold-100 transition"
      >
        <Bell size={15} className="text-gold" />
        <span className="hidden sm:inline">{t("notifications.enableBtn")}</span>
      </button>
    );
  }

  // Full Card variant (for Parent Portal or Settings)
  if (permission === "granted") {
    return (
      <div className="flex items-center justify-between rounded-xl border border-green-200 bg-green-50/70 p-3.5 text-green-800">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-200 text-green-800">
            <BellCheck size={18} />
          </div>
          <div>
            <span className="text-xs font-semibold block">{t("notifications.enabled")}</span>
            <span className="text-[11px] text-green-700/80">
              {t("notifications.enabledDesc")}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleTestNotification}
          className="flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-green-800 shadow-sm border border-green-200 hover:bg-green-100 transition"
        >
          <Sparkles size={13} className="text-gold" />
          <span>{tested ? t("notifications.testSent") : t("notifications.testBtn")}</span>
        </button>
      </div>
    );
  }

  if (permission === "denied") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-cream-400 bg-cream-100 p-3 text-xs text-cream-600">
        <BellOff size={16} className="text-cream-500" />
        <span>{t("notifications.blocked")}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold-50/70 p-3.5 text-navy">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold/20 text-gold">
          <Bell size={19} />
        </div>
        <div>
          <h5 className="text-xs font-bold text-navy">{t("notifications.enableTitle")}</h5>
          <p className="text-[11px] text-cream-700 mt-0.5">
            {t("notifications.enableDesc")}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleEnable}
        disabled={loading}
        className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-navy px-3.5 py-1.5 text-xs font-semibold text-cream hover:bg-navy-700 transition shadow-sm"
      >
        <Bell size={14} className="text-gold" />
        <span>{loading ? "..." : t("notifications.enableBtn")}</span>
      </button>
    </div>
  );
}
