import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { addDays, addMonths, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  EllipsisVertical,
  FileText,
  GraduationCap,
  User,
  Users,
  Zap,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { subscribeToSessions } from "../../lib/services/sessionsService";
import type { ClassRecord, SessionRecord, TeacherGender } from "../../types";
import { Sparks, Star } from "../home/KidHomeArt";
import bannerFemale from "../../assets/kid-dashboard/banner-female.webp";
import bannerMale from "../../assets/kid-dashboard/banner-male.webp";
import cornerDecor from "../../assets/kid-dashboard/corner-decor.webp";

/**
 * Kid-mode teacher dashboard: banner (male / female teacher), three stat cards,
 * recent classes, quick actions and the upcoming-sessions calendar. Everything
 * is computed from the teacher's real classes, students and sessions.
 */

const CARD =
  "rounded-3xl border border-navy-100/80 bg-white shadow-[0_12px_30px_-18px_rgba(90,60,200,0.5)]";

const ISO = "yyyy-MM-dd";

/** Locale for month / weekday names — Arabic keeps Latin digits like the rest of the app. */
function intlLocale(lang: string) {
  return lang.startsWith("ar") ? "ar-u-nu-latn" : lang;
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2.5 font-serif text-xl font-bold text-navy-700">
      <span className="text-navy-500">{icon}</span>
      {children}
    </h2>
  );
}

function TextLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="flex shrink-0 items-center gap-1 text-sm font-bold text-navy-600 hover:text-navy-800 hover:underline"
    >
      {children}
      <ArrowRight size={15} className="rtl:-scale-x-100" aria-hidden="true" />
    </Link>
  );
}

/* ─────────────────────────────── banner ─────────────────────────────── */

function Banner({ gender }: { gender: TeacherGender }) {
  const { t } = useTranslation();
  return (
    <section
      className="relative overflow-hidden rounded-[1.75rem] border border-navy-100/80 shadow-[0_12px_30px_-18px_rgba(90,60,200,0.5)] [container-type:inline-size]"
      style={{ aspectRatio: "975 / 231" }}
    >
      <img
        src={gender === "male" ? bannerMale : bannerFemale}
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-left"
      />
      {/* headline sits on the white cloud; positioned physically so Arabic keeps the same layout */}
      <div className="absolute left-[62.7%] top-[47%] -translate-x-1/2 -translate-y-1/2 text-center">
        <div className="relative">
          <Sparks className="absolute -left-[5.5cqw] top-[0.2cqw] h-[6.5cqw] opacity-95" />
          <Sparks flip className="absolute -right-[5.5cqw] top-[0.2cqw] h-[6.5cqw] opacity-95" />
          <p className="whitespace-nowrap font-serif text-[3.7cqw] font-extrabold leading-[1.28] text-navy-700">
            {t("dashboard.bannerLine1")}
            <br />
            {t("dashboard.bannerLine2")}
          </p>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────── stat cards ───────────────────────────── */

function StatCard({
  to,
  icon,
  label,
  value,
  caption,
  tone,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  value: number;
  caption: string;
  tone: { disc: string; label: string; arrow: string };
}) {
  return (
    <Link
      to={to}
      className={`group flex items-center gap-3 p-4 transition-transform 2xl:gap-4 2xl:p-5 duration-200 ease-bouncy hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${CARD}`}
    >
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full 2xl:h-16 2xl:w-16 ${tone.disc}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={`block text-xs font-extrabold uppercase tracking-wide 2xl:text-sm ${tone.label}`}>{label}</span>
        <span className="block font-serif text-3xl font-bold leading-tight text-navy-800 2xl:text-4xl">{value}</span>
        <span className="mt-1 flex items-center justify-between gap-2">
          <span className="line-clamp-2 text-xs font-semibold leading-snug text-cream-600">{caption}</span>
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 ${tone.arrow}`}
          >
            <ArrowRight size={15} strokeWidth={3} className="rtl:-scale-x-100" aria-hidden="true" />
          </span>
        </span>
      </span>
    </Link>
  );
}

/* ─────────────────────────── recent classes ─────────────────────────── */

const ROW_COLORS = ["bg-[#F0668B]", "bg-[#7A5AF0]", "bg-[#2CC0A6]", "bg-[#C04BD6]"];
const ROW_ICONS = [BookOpen, Users, User, GraduationCap];

function RecentClasses({
  classes,
  studentCounts,
  nextSession,
  today,
}: {
  classes: ClassRecord[];
  studentCounts: Record<string, number>;
  nextSession: Record<string, string>;
  today: Date;
}) {
  const { t, i18n } = useTranslation();
  const rows = useMemo(() => [...classes].sort((a, b) => b.createdAt - a.createdAt).slice(0, 4), [classes]);
  const todayIso = format(today, ISO);
  const tomorrowIso = format(addDays(today, 1), ISO);

  function describeNext(iso?: string): string {
    if (!iso) return "—";
    if (iso === todayIso) return t("dashboard.today");
    if (iso === tomorrowIso) return t("dashboard.tomorrow");
    return new Intl.DateTimeFormat(intlLocale(i18n.language), { month: "short", day: "numeric" }).format(
      new Date(`${iso}T00:00:00`)
    );
  }

  return (
    <section className={`p-5 sm:p-6 ${CARD}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <SectionTitle icon={<Users size={24} />}>{t("dashboard.recentClasses")}</SectionTitle>
        <TextLink to="/classes">{t("dashboard.viewAll")}</TextLink>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl bg-navy-50 px-4 py-6 text-center text-sm font-semibold text-cream-600">
          {t("classes.noClasses")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-navy-100/80">
          <table className="w-full min-w-[34rem] text-start text-sm">
            <thead>
              <tr className="bg-navy-50/80 text-xs font-bold text-cream-600">
                <th className="px-4 py-2.5 text-start font-bold">{t("dashboard.colClass")}</th>
                <th className="px-3 py-2.5 text-start font-bold">{t("dashboard.colStudents")}</th>
                <th className="px-3 py-2.5 text-start font-bold">{t("dashboard.colNext")}</th>
                <th className="px-3 py-2.5 text-start font-bold">{t("dashboard.colStatus")}</th>
                <th className="w-10 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => {
                const Icon = ROW_ICONS[i % ROW_ICONS.length];
                const next = nextSession[c.id];
                const active = !!next;
                return (
                  <tr key={c.id} className="border-t border-navy-100/70">
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-3">
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white ${
                            ROW_COLORS[i % ROW_COLORS.length]
                          }`}
                        >
                          <Icon size={18} />
                        </span>
                        <span className="font-bold text-navy-800">{c.name}</span>
                      </span>
                    </td>
                    <td className="px-3 py-3 font-semibold text-cream-700">{studentCounts[c.id] || 0}</td>
                    <td className="px-3 py-3 font-semibold text-cream-700">{describeNext(next)}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-bold ${
                          active ? "bg-[#DDF7E9] text-[#1B9A66]" : "bg-navy-50 text-cream-600"
                        }`}
                      >
                        {active ? t("dashboard.statusActive") : t("dashboard.statusInactive")}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-end">
                      <Link
                        to="/classes"
                        title={t("dashboard.openClass")}
                        aria-label={t("dashboard.openClass")}
                        className="inline-flex rounded-full p-1.5 text-cream-600 hover:bg-navy-50 hover:text-navy-700"
                      >
                        <EllipsisVertical size={18} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ───────────────────────────── quick actions ───────────────────────────── */

const ACTIONS = [
  { to: "/classes", key: "createClass", icon: CirclePlus, tone: "bg-[#E6DEFF] border-[#D4C8FB] text-navy-800" },
  { to: "/students", key: "addStudents", icon: Users, tone: "bg-[#DDEBFF] border-[#C6DBFA] text-[#2A63C4]" },
  { to: "/attendance", key: "viewAttendance", icon: CalendarCheck, tone: "bg-[#FFF0C6] border-[#F6DD92] text-[#C27500]" },
  { to: "/sessions", key: "createSession", icon: FileText, tone: "bg-[#D9F6E8] border-[#B8EAD2] text-[#178F63]" },
] as const;

function QuickActions() {
  const { t } = useTranslation();
  return (
    <section className={`p-5 sm:p-6 ${CARD}`}>
      <div className="mb-4">
        <SectionTitle icon={<Zap size={24} />}>{t("dashboard.quickActions")}</SectionTitle>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {ACTIONS.map(({ to, key, icon: Icon, tone }) => (
          <Link
            key={key}
            to={to}
            className={`flex min-h-[5.25rem] flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-3 text-center text-sm font-bold transition-transform duration-200 ease-bouncy hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${tone}`}
          >
            <Icon size={26} />
            {t(`dashboard.${key}`)}
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────────── calendar ─────────────────────────────── */

function UpcomingCalendar({ sessionDates, today }: { sessionDates: Set<string>; today: Date }) {
  const { t, i18n } = useTranslation();
  const [month, setMonth] = useState(() => startOfMonth(today));
  const [selected, setSelected] = useState<string | null>(null);
  const locale = intlLocale(i18n.language);

  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(month);
  const weekdays = useMemo(() => {
    // 2024-01-07 is a Sunday → Sunday-first labels, like the design.
    const fmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 7 + i)));
  }, [locale]);

  const start = startOfWeek(month, { weekStartsOn: 0 });
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));

  return (
    <section className={`relative p-5 sm:p-6 ${CARD}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <SectionTitle icon={<CalendarDays size={24} />}>{t("dashboard.upcoming")}</SectionTitle>
        <TextLink to="/sessions">{t("dashboard.viewCalendar")}</TextLink>
      </div>

      <div className="mb-2 flex items-center justify-between px-6">
        <button
          type="button"
          onClick={() => setMonth((m) => addMonths(m, -1))}
          aria-label={t("dashboard.prevMonth")}
          className="rounded-full p-1.5 text-navy-700 hover:bg-navy-50"
        >
          <ChevronLeft size={20} className="rtl:-scale-x-100" />
        </button>
        <p className="font-serif text-lg font-bold text-navy-800">{monthLabel}</p>
        <button
          type="button"
          onClick={() => setMonth((m) => addMonths(m, 1))}
          aria-label={t("dashboard.nextMonth")}
          className="rounded-full p-1.5 text-navy-700 hover:bg-navy-50"
        >
          <ChevronRight size={20} className="rtl:-scale-x-100" />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-xs font-bold text-cream-600">
        {weekdays.map((w, i) => (
          <span key={i} className="py-2">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {days.map((d) => {
          const iso = format(d, ISO);
          const inMonth = isSameMonth(d, month);
          const isToday = isSameDay(d, today);
          const isSelected = selected === iso && !isToday;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => setSelected(iso)}
              className="group flex flex-col items-center py-0.5 outline-none"
              aria-label={format(d, "PPP")}
              aria-current={isToday ? "date" : undefined}
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition ${
                  isToday
                    ? "bg-navy-700 text-white shadow-[0_6px_12px_-6px_rgba(59,34,135,0.8)]"
                    : isSelected
                    ? "bg-navy-100 text-navy-800"
                    : inMonth
                    ? "text-navy-700 group-hover:bg-navy-50"
                    : "text-cream-500/70 group-hover:bg-navy-50"
                }`}
              >
                {d.getDate()}
              </span>
              <span
                className={`mt-0.5 h-1.5 w-1.5 rounded-full ${
                  sessionDates.has(iso) ? "bg-[#F5B301]" : "bg-transparent"
                }`}
              />
            </button>
          );
        })}
      </div>

      {/* decoration from the design: a star, and the owl mug on a stack of books */}
      <Star className="pointer-events-none absolute -bottom-4 left-4 w-9" />
      <img
        src={cornerDecor}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-6 -right-6 w-[38%] max-w-[190px] select-none"
      />
    </section>
  );
}

/* ─────────────────────────────── page ─────────────────────────────── */

export default function KidDashboard({
  classes,
  studentCounts,
  extra,
}: {
  classes: ClassRecord[];
  studentCounts: Record<string, number>;
  /** Existing dashboard features the design has no slot for (announcements) — shown under Recent Classes. */
  extra?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const gender: TeacherGender = profile?.gender ?? "female";
  const today = useMemo(() => new Date(), []);
  const todayIso = format(today, ISO);

  // One live sessions feed per class (sessions are stored per class).
  const [sessionsByClass, setSessionsByClass] = useState<Record<string, SessionRecord[]>>({});
  const classKey = classes.map((c) => c.id).join(",");
  useEffect(() => {
    const unsubscribes = classes.map((c) =>
      subscribeToSessions(
        c.id,
        (list) => setSessionsByClass((prev) => ({ ...prev, [c.id]: list })),
        console.error
      )
    );
    return () => unsubscribes.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classKey]);

  const { todayCount, nextSession, sessionDates } = useMemo(() => {
    const ids = new Set(classes.map((c) => c.id));
    let todayCount = 0;
    const nextSession: Record<string, string> = {};
    const sessionDates = new Set<string>();
    for (const [classId, list] of Object.entries(sessionsByClass)) {
      if (!ids.has(classId)) continue;
      for (const s of list) {
        sessionDates.add(s.date);
        if (s.date === todayIso) todayCount += 1;
        if (s.date >= todayIso && (!nextSession[classId] || s.date < nextSession[classId])) {
          nextSession[classId] = s.date;
        }
      }
    }
    return { todayCount, nextSession, sessionDates };
  }, [sessionsByClass, classes, todayIso]);

  const totalStudents = classes.reduce((sum, c) => sum + (studentCounts[c.id] || 0), 0);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(19rem,0.46fr)] xl:gap-6">
      <h1 className="sr-only">{t("dashboard.title")}</h1>

      <div className="min-w-0 space-y-5">
        <Banner gender={gender} />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard
            to="/classes"
            icon={<BookOpen size={26} />}
            label={t("dashboard.totalClasses")}
            value={classes.length}
            caption={t("dashboard.manageClasses")}
            tone={{ disc: "bg-[#E9E2FF] text-[#6D4AE0]", label: "text-[#6D4AE0]", arrow: "bg-[#7A5AF0]" }}
          />
          <StatCard
            to="/students"
            icon={<Users size={26} />}
            label={t("dashboard.totalStudents")}
            value={totalStudents}
            caption={t("dashboard.manageStudents")}
            tone={{ disc: "bg-[#DDEBFF] text-[#3B82F6]", label: "text-[#3B7FD8]", arrow: "bg-[#3B82F6]" }}
          />
          <StatCard
            to="/sessions"
            icon={<CalendarCheck size={26} />}
            label={t("dashboard.todaySessions")}
            value={todayCount}
            caption={t("dashboard.viewSessions")}
            tone={{ disc: "bg-[#FFF0C6] text-[#F59E0B]", label: "text-[#D98300]", arrow: "bg-[#FFB020]" }}
          />
        </div>

        <RecentClasses classes={classes} studentCounts={studentCounts} nextSession={nextSession} today={today} />

        {extra}
      </div>

      <div className="min-w-0 space-y-5">
        <QuickActions />
        <UpcomingCalendar sessionDates={sessionDates} today={today} />
      </div>
    </div>
  );
}
