import { Globe, LogOut, Repeat } from "lucide-react";
import { useTranslation } from "react-i18next";
import Logo from "../common/Logo";
import ThemeToggle from "../common/ThemeToggle";
import AnnouncementCard from "../common/AnnouncementCard";
import WeeklyChampions from "../common/WeeklyChampions";
import whatsappIcon from "../../assets/whatsapp-icon.png";
import ChildSwitcher from "./ChildSwitcher";
import KidChildPanel from "./KidChildPanel";
import { KID_SKY_BACKGROUND, Star } from "../home/KidHomeArt";
import booksPlant from "../../assets/kid-parent-portal/booksplant-topleft.webp";
import owl from "../../assets/kid-parent-portal/owl-topright.webp";
import family from "../../assets/kid-parent-portal/family-bottomleft.webp";
import pencils from "../../assets/kid-parent-portal/pencils-bottomright.webp";
import type { Announcement, ClassRanking } from "../../types";

/**
 * Kid-mode parent portal (post sign-in). Mirrors ParentPortalPage's classic
 * layout one-for-one — same child tabs, same live child data via
 * KidChildPanel, same announcements and same per-class weekly-champions
 * boards (WeeklyChampions, unchanged — including any board whose class
 * happens to be named so it reads "Champions — My Family"), same floating
 * WhatsApp button — restyled to the reference design.
 */
export default function KidParentPortalPage({
  studentIds,
  currentStudentId,
  onSelectStudent,
  onChildRemoved,
  announcements,
  rankings,
  contactHref,
  language,
  onToggleLanguage,
  onSignOut,
  canSwitchToTeacher,
  onSwitchToTeacher,
}: {
  studentIds: string[];
  currentStudentId: string;
  onSelectStudent: (studentId: string) => void;
  onChildRemoved: (studentId: string) => void;
  announcements: Announcement[];
  rankings: ClassRanking[];
  contactHref: string | null;
  language: string;
  onToggleLanguage: () => void;
  onSignOut: () => void;
  /** True when this same Google account also has a teacher profile. */
  canSwitchToTeacher?: boolean;
  onSwitchToTeacher?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="relative min-h-screen overflow-x-clip" style={{ background: KID_SKY_BACKGROUND }}>
      {/* ───────────── scenery (decorative, fixed to the viewport corners) ───────────── */}
      <div className="pointer-events-none fixed inset-0 z-0 select-none" aria-hidden="true">
        <img src={booksPlant} alt="" className="absolute left-0 top-16 hidden w-40 lg:block xl:w-48" />
        <img src={owl} alt="" className="absolute right-0 top-16 hidden w-36 lg:block xl:w-44" />
        <img src={family} alt="" className="absolute bottom-0 left-0 hidden w-44 xl:block" />
        <img src={pencils} alt="" className="absolute bottom-24 right-0 hidden w-40 lg:block xl:w-48" />
        <Star className="absolute left-[6%] top-[20%] hidden w-6 xl:block" />
        <Star className="absolute left-[10%] top-[52%] hidden w-5 lg:block" />
        <Star className="absolute right-[8%] top-[8%] hidden w-6 lg:block" />
        <Star className="absolute right-[6%] top-[40%] hidden w-5 xl:block" />
      </div>

      {/* ───────────── header + child/subject selector: one sticky block with an opaque backdrop, so the scenery never shows through it ───────────── */}
      <div className="sticky top-0 z-30 drop-shadow-sm">
      <header className="flex items-center justify-between gap-3 bg-white/30 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="flex items-center gap-2">
          <Logo size={32} />
          <span className="font-serif text-lg font-extrabold text-navy-700 sm:text-xl">{t("app.name")}</span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          <ThemeToggle variant="pill" />
          <button
            type="button"
            onClick={onToggleLanguage}
            className="flex items-center gap-1.5 rounded-full border-2 border-navy-100 px-3 py-1.5 text-xs font-extrabold text-navy-700 transition hover:bg-navy-50 sm:px-3.5"
          >
            <Globe size={14} />
            {language === "ar" ? "EN" : "AR"}
          </button>
          {canSwitchToTeacher && (
            <button
              type="button"
              onClick={onSwitchToTeacher}
              className="flex items-center gap-1.5 rounded-full border-2 border-navy-100 px-3 py-1.5 text-xs font-extrabold text-navy-700 transition hover:bg-navy-50 sm:px-3.5"
            >
              <Repeat size={14} />
              <span className="hidden sm:inline">{t("nav.switchToTeacher")}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onSignOut}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-extrabold text-navy-500 transition hover:bg-navy-50 sm:px-3"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">{t("nav.signOut")}</span>
          </button>
        </div>
      </header>
      <ChildSwitcher
        studentIds={studentIds}
        currentStudentId={currentStudentId}
        onSelect={onSelectStudent}
        onRemoved={onChildRemoved}
        variant="kid"
        bar
      />
      </div>

      <main className="relative z-10 mx-auto max-w-2xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        {announcements.map((a) => (
          <AnnouncementCard key={a.id} announcement={a} />
        ))}

        {rankings.length > 0 && (
          <div className="space-y-4">
            {rankings.map((r) => (
              <WeeklyChampions key={r.classId} ranking={r} classLabel={r.className} />
            ))}
          </div>
        )}

        {currentStudentId ? (
          <KidChildPanel key={currentStudentId} studentId={currentStudentId} onRemoved={onChildRemoved} rankings={rankings} />
        ) : (
          <div className="rounded-[1.75rem] border border-white bg-white/95 p-6 text-center text-sm font-semibold text-cream-600 shadow-[0_18px_34px_-24px_rgba(90,60,200,0.45)]">
            {t("portal.noChildrenLinked")}
          </div>
        )}
      </main>

      {contactHref && (
        <a
          href={contactHref}
          target="_blank"
          rel="noopener noreferrer"
          title={t("portal.contactWhatsapp")}
          aria-label={t("portal.contactWhatsapp")}
          className="fixed bottom-6 end-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition hover:scale-105 hover:shadow-xl"
        >
          <img src={whatsappIcon} alt="" className="h-full w-full rounded-full" />
        </a>
      )}
    </div>
  );
}
