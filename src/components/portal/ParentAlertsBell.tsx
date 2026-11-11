import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Bell, BellRing, CalendarCheck, Award, MessageSquareText, Star, X } from "lucide-react";
import Switch from "../common/Switch";
import {
  DEFAULT_ALERT_PREFS,
  markAlertsRead,
  saveAlertPrefs,
  subscribeToAlertPrefs,
  subscribeToChildAlerts,
  wantsInstant,
  type AlertPrefs,
  type ParentAlert,
} from "../../lib/services/parentAlertsService";
import {
  getNotificationPermission,
  isPushSupported,
  requestNotificationPermission,
  saveUserPushSubscription,
  sendLocalNotification,
} from "../../lib/services/pushNotificationService";
import { playGain, playLoss, playReveal, unlockSound } from "../../lib/sounds";

/**
 * The parent's alert bell: live log of everything the teacher records about their children (notes, marks,
 * attendance, certificates) + the parent's own choices for which events alert them instantly.
 * Works for every linked child at once. Used in both the classic and the kid-mode parent header.
 */
export default function ParentAlertsBell({
  parentUid,
  studentIds,
  variant = "classic",
}: {
  parentUid: string;
  studentIds: string[];
  variant?: "classic" | "kid";
}) {
  const { t, i18n } = useTranslation();
  const [byChild, setByChild] = useState<Record<string, ParentAlert[]>>({});
  const [prefs, setPrefs] = useState<AlertPrefs>(DEFAULT_ALERT_PREFS);
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<ParentAlert[]>([]);
  const [permission, setPermission] = useState<NotificationPermission>(getNotificationPermission);

  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const seen = useRef<Set<string>>(new Set());
  const loaded = useRef<Set<string>>(new Set());

  useEffect(() => subscribeToAlertPrefs(parentUid, setPrefs), [parentUid]);

  const describe = useCallback(
    (a: ParentAlert): { title: string; body: string } => {
      const name = a.studentName || "";
      const label = (r?: string) =>
        r === "custom" && a.text ? a.text : t(`points.reasons.${r}`, { defaultValue: a.text || r || "" });
      switch (a.type) {
        case "note":
          return { title: t("parentAlerts.newNote", { name }), body: a.text || "" };
        case "points": {
          const n = Math.abs(a.amount || 0);
          return {
            title: t((a.amount || 0) >= 0 ? "parentAlerts.gained" : "parentAlerts.deducted", { n, name }),
            body: a.subject ? `${label(a.reason)} · ${a.subject}` : label(a.reason),
          };
        }
        case "attendance":
          return {
            title: t("parentAlerts.attendanceTitle", { name, status: t(`attendance.${a.status}`, { defaultValue: a.status }) }),
            body: a.subject || "",
          };
        case "certificate":
          return { title: t("parentAlerts.certificate", { name }), body: a.text || "" };
      }
    },
    [t]
  );

  // One live listener per child. The first snapshot of a child only fills the log; anything that arrives later is "new".
  const idsKey = studentIds.join(",");
  useEffect(() => {
    const unsubs = studentIds.map((sid) =>
      subscribeToChildAlerts(
        sid,
        (alerts) => {
          setByChild((prev) => ({ ...prev, [sid]: alerts }));
          const firstLoad = !loaded.current.has(sid);
          loaded.current.add(sid);
          const incoming = alerts.filter((a) => !seen.current.has(a.id));
          incoming.forEach((a) => seen.current.add(a.id));
          if (firstLoad) return;
          for (const a of incoming) {
            if (a.readBy?.includes(parentUid)) continue;
            if (!wantsInstant(prefsRef.current, a)) continue; // still in the log, just no pop-up
            setToasts((prev) => [a, ...prev].slice(0, 3));
            window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== a.id)), 7000);
            if (prefsRef.current.sound) {
              if (a.type === "points" && (a.amount || 0) < 0) playLoss();
              else if (a.type === "points") playGain(a.amount || 1);
              else playReveal();
            }
            if (document.hidden && getNotificationPermission() === "granted") {
              const d = describe(a);
              void sendLocalNotification(d.title, { body: d.body, tag: a.id, dir: "auto" });
            }
          }
        },
        (err) => console.warn("Alerts listener", err)
      )
    );
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, parentUid]);

  const all = useMemo(
    () => Object.values(byChild).flat().sort((a, b) => b.createdAt - a.createdAt).slice(0, 150),
    [byChild]
  );
  const unread = useMemo(() => all.filter((a) => !a.readBy?.includes(parentUid)), [all, parentUid]);

  function openPanel() {
    unlockSound();
    setFresh(new Set(unread.map((a) => a.id)));
    setToasts([]);
    setOpen(true);
    if (unread.length) void markAlertsRead(parentUid, unread.map((a) => a.id));
  }

  function updatePref<K extends keyof AlertPrefs>(key: K, value: AlertPrefs[K]) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    void saveAlertPrefs(parentUid, next).catch((e) => console.warn("Could not save alert settings", e));
  }

  async function enableDevice() {
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result === "granted") await saveUserPushSubscription("parents", parentUid);
  }

  const time = (ms: number) =>
    new Date(ms).toLocaleString(i18n.language === "ar" ? "ar" : "en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  const iconFor = (a: ParentAlert) => {
    const cls = a.tone === "negative" ? "text-red-600" : a.tone === "positive" ? "text-green-600" : "text-navy";
    const props = { size: 18, className: cls };
    if (a.type === "note") return <MessageSquareText {...props} />;
    if (a.type === "attendance") return <CalendarCheck {...props} />;
    if (a.type === "certificate") return <Award {...props} />;
    return <Star {...props} />;
  };

  const btnClass =
    variant === "kid"
      ? "relative flex items-center gap-1.5 rounded-full border-2 border-navy-100 px-3 py-1.5 text-xs font-extrabold text-navy-700 transition hover:bg-navy-50 sm:px-3.5"
      : "relative flex items-center gap-1.5 rounded-lg border border-gold/40 px-3 py-1.5 text-xs font-semibold text-navy hover:bg-gold-50";

  const prefRows: { key: keyof AlertPrefs; label: string }[] = [
    { key: "notes", label: t("parentAlerts.notes") },
    { key: "pointsGained", label: t("parentAlerts.pointsGained") },
    { key: "pointsDeducted", label: t("parentAlerts.pointsDeducted") },
    { key: "attendance", label: t("parentAlerts.attendance") },
    { key: "certificates", label: t("parentAlerts.certificates") },
    { key: "sound", label: t("parentAlerts.sound") },
  ];

  return (
    <>
      <button type="button" onClick={openPanel} className={btnClass} title={t("parentAlerts.title")}>
        {unread.length > 0 ? <BellRing size={14} className="text-gold" /> : <Bell size={14} />}
        <span className="hidden sm:inline">{t("parentAlerts.bell")}</span>
        {unread.length > 0 && (
          <span className="absolute -top-1.5 -end-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unread.length > 99 ? "99+" : unread.length}
          </span>
        )}
      </button>

      {createPortal(
        <>
          {/* Instant pop-ups */}
          <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3">
            {toasts.map((a) => {
              const d = describe(a);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={openPanel}
                  className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-gold/40 bg-white p-3 text-start shadow-xl"
                >
                  <span className="mt-0.5 shrink-0">{iconFor(a)}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-navy">{d.title}</span>
                    {d.body && <span className="block truncate text-xs text-cream-700">{d.body}</span>}
                  </span>
                </button>
              );
            })}
          </div>

          {open && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 px-2 backdrop-blur-sm sm:px-4">
              <div className="card flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden p-0">
                <div className="flex items-center justify-between border-b border-cream-400 px-4 py-3">
                  <h2 className="text-base font-semibold text-navy">{t("parentAlerts.title")}</h2>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label={t("parentAlerts.close")}
                    className="rounded-full p-1 text-cream-600 hover:bg-cream-300 hover:text-navy"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="overflow-y-auto overscroll-contain">
                  <div className="space-y-2.5 border-b border-cream-400 bg-cream-100/70 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-navy">{t("parentAlerts.settings")}</p>
                      <p className="text-xs text-cream-600">{t("parentAlerts.settingsHint")}</p>
                    </div>
                    {prefRows.map((r) => (
                      <div key={r.key} className="flex items-center justify-between gap-3">
                        <span className="text-sm text-navy">{r.label}</span>
                        <Switch checked={prefs[r.key]} onChange={(v) => updatePref(r.key, v)} label={r.label} />
                      </div>
                    ))}
                    {isPushSupported() && (
                      <div className="flex items-center justify-between gap-3 pt-1">
                        <div className="min-w-0">
                          <span className="text-sm text-navy">{t("parentAlerts.device")}</span>
                          <p className="text-[11px] text-cream-600">{t("parentAlerts.deviceHint")}</p>
                        </div>
                        {permission === "granted" ? (
                          <span className="shrink-0 text-xs font-semibold text-green-700">{t("parentAlerts.deviceOn")}</span>
                        ) : permission === "denied" ? (
                          <span className="shrink-0 text-xs text-cream-600">{t("parentAlerts.deviceBlocked")}</span>
                        ) : (
                          <button type="button" onClick={enableDevice} className="btn-secondary shrink-0 px-3 py-1.5 text-xs">
                            {t("parentAlerts.deviceEnable")}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {all.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-cream-600">{t("parentAlerts.empty")}</p>
                  ) : (
                    <ul className="divide-y divide-cream-400">
                      {all.map((a) => {
                        const d = describe(a);
                        return (
                          <li key={a.id} className={`flex items-start gap-3 px-4 py-3 ${fresh.has(a.id) ? "bg-gold-50" : ""}`}>
                            <span className="mt-0.5 shrink-0">{iconFor(a)}</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-navy">
                                {d.title}
                                {fresh.has(a.id) && (
                                  <span className="ms-2 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                    {t("parentAlerts.new")}
                                  </span>
                                )}
                              </p>
                              {d.body && <p className="break-words text-xs text-cream-700">{d.body}</p>}
                              <p className="mt-0.5 text-[11px] text-cream-600">{time(a.createdAt)}</p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
        </>,
        document.body
      )}
    </>
  );
}
