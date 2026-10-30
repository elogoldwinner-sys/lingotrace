import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { LogOut, Globe, Camera, MessageCircle, Trophy, ChevronDown, Mars, Venus, Repeat } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { uploadToCloudinary } from "../../lib/cloudinary";
import { getDefaultRankingPeriod } from "../../lib/services/classRankingsService";
import Modal from "../common/Modal";
import { ACTION_TONES } from "../../lib/uiColors";
import ThemeToggle from "../common/ThemeToggle";
import SchoolLogo from "./SchoolLogo";
import { useTheme } from "../../contexts/ThemeContext";
import type { TeacherGender } from "../../types";

/** "YYYY-MM-DD" in local time, the format <input type="date"> needs. */
function msToLocalDateValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "Mahmoud Badawi" → "Badawi" (the design greets teachers as "Ms. Ahmed"). */
function familyName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  return parts[parts.length - 1] || displayName;
}

const KID_TONES = {
  blue: "!border-blue-300 !bg-blue-50 !text-blue-800 hover:!bg-blue-100",
  emerald: "!border-emerald-300 !bg-emerald-50 !text-emerald-800 hover:!bg-emerald-100",
  amber: "!border-amber-300 !bg-amber-50 !text-amber-800 hover:!bg-amber-100",
};

const KID_PILL =
  "flex items-center gap-1.5 rounded-full border border-navy-100 bg-white px-2.5 py-1.5 text-sm font-bold sm:gap-2 sm:px-4 sm:py-2 text-navy-700 shadow-[0_4px_12px_-8px_rgba(90,60,200,0.5)] transition hover:-translate-y-0.5 hover:bg-navy-50";

export default function Topbar() {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const isKid = theme === "kid";
  const {
    profile,
    portalParent,
    portalStudent,
    signOut,
    updateTeacherPhoto,
    updateTeacherWhatsapp,
    updateTeacherRankingPeriod,
    updateTeacherGender,
  } = useAuth();
  const navigate = useNavigate();
  // This same Google account may ALSO have a parent or student portal
  // profile (e.g. a teacher who joined a class as a parent too) — when it
  // does, offer a one-click switch instead of forcing a separate login.
  const otherPortalPath = portalParent ? "/portal/parent" : portalStudent ? "/portal/student" : null;
  const otherPortalLabel = portalParent
    ? t("nav.switchToParentPortal")
    : t("nav.switchToStudentPortal");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
  const [whatsappInput, setWhatsappInput] = useState("");
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);

  const defaultPeriod = getDefaultRankingPeriod();
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleStart, setScheduleStart] = useState(msToLocalDateValue(defaultPeriod.start));
  const [scheduleEnd, setScheduleEnd] = useState(msToLocalDateValue(defaultPeriod.end));
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState("");

  // Kid mode only: the avatar's drop-down (change photo / sign out).
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const gender: TeacherGender = profile?.gender ?? "female";

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  function handleGender(next: TeacherGender) {
    if (next === gender) return;
    updateTeacherGender(next).catch((err) => console.error("Could not save the teacher gender", err));
  }

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  function toggleLanguage() {
    i18n.changeLanguage(i18n.language === "ar" ? "en" : "ar");
  }

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadToCloudinary(file, "lingotrace/teachers");
      await updateTeacherPhoto(result.secure_url);
    } finally {
      setUploading(false);
    }
  }

  function openWhatsappModal() {
    setWhatsappInput(profile?.whatsappNumber || "");
    setWhatsappModalOpen(true);
  }

  async function handleSaveWhatsapp(e: React.FormEvent) {
    e.preventDefault();
    setSavingWhatsapp(true);
    try {
      await updateTeacherWhatsapp(whatsappInput.trim());
      setWhatsappModalOpen(false);
    } finally {
      setSavingWhatsapp(false);
    }
  }

  function openScheduleModal() {
    const period = getDefaultRankingPeriod();
    setScheduleStart(msToLocalDateValue(profile?.rankingPeriodStart ?? period.start));
    setScheduleEnd(msToLocalDateValue(profile?.rankingPeriodEnd ?? period.end));
    setScheduleError("");
    setScheduleModalOpen(true);
  }

  async function handleSaveSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!scheduleStart || !scheduleEnd) return;
    // ISO date strings sort the same as the dates they represent.
    if (scheduleEnd < scheduleStart) {
      setScheduleError(t("ranking.invalidRange"));
      return;
    }
    setScheduleError("");
    setSavingSchedule(true);
    try {
      // End date is inclusive through the end of that calendar day.
      const startMs = new Date(`${scheduleStart}T00:00:00`).getTime();
      const endMs = new Date(`${scheduleEnd}T23:59:59.999`).getTime();
      await updateTeacherRankingPeriod(startMs, endMs);
      setScheduleModalOpen(false);
    } catch (err) {
      console.error("Could not save the champions period", err);
      setScheduleError(t("ranking.saveError"));
    } finally {
      setSavingSchedule(false);
    }
  }

  return (
    <>
      {isKid ? (
        <>
          <header className="z-20 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-navy-100/70 bg-white/85 px-3 py-2 shadow-[0_8px_24px_-16px_rgba(90,60,200,0.5)] backdrop-blur sm:px-4 sm:py-3 md:sticky md:top-0 md:px-8">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <SchoolLogo size={46} />
              <span className="hidden text-[2.2rem] leading-none sm:inline" aria-hidden="true">
                👋
              </span>
              <div className="min-w-0">
                {profile && (
                  <p className="line-clamp-2 break-words font-serif text-base font-bold leading-tight text-navy-700 sm:text-xl md:truncate md:text-2xl">
                    {t("dashboard.welcomeKid", {
                      // U+200E keeps the "!" after an Arabic name on the correct side in an English sentence.
                      name: `${t(gender === "male" ? "dashboard.titleMr" : "dashboard.titleMs")} ${familyName(profile.displayName)}\u200E`,
                    })}
                  </p>
                )}
                <p className="hidden truncate text-sm font-semibold text-cream-600 min-[1400px]:block">{t("dashboard.welcomeSub")}</p>
              </div>
            </div>

            <div className="flex w-full shrink-0 flex-wrap items-center justify-between gap-1.5 sm:gap-2 lg:w-auto lg:flex-nowrap lg:justify-end">
              <ThemeToggle variant="header" className={ACTION_TONES.violet} />

              <button onClick={toggleLanguage} className={`${KID_PILL} ${KID_TONES.blue}`} title={t("common.language")}>
                <Globe size={17} />
                {i18n.language === "ar" ? "EN" : "AR"}
              </button>

              <button onClick={openWhatsappModal} className={`${KID_PILL} ${KID_TONES.emerald}`} title={t("settings.whatsappNumber")}>
                <MessageCircle size={17} />
                <span className="hidden 2xl:inline">{t("settings.whatsapp")}</span>
              </button>

              <button onClick={openScheduleModal} className={`${KID_PILL} ${KID_TONES.amber}`} title={t("ranking.scheduleLabel")}>
                <Trophy size={17} />
                <span className="hidden 2xl:inline">{t("ranking.schedule")}</span>
              </button>

              {/* male / female — picks the teacher illustration on the dashboard */}
              <div
                role="group"
                aria-label={t("dashboard.genderLabel")}
                className="flex items-center rounded-full border border-navy-100 bg-white p-1 shadow-[0_4px_12px_-8px_rgba(90,60,200,0.5)]"
              >
                {(["male", "female"] as const).map((g) => {
                  const active = gender === g;
                  const label = t(g === "male" ? "dashboard.genderMale" : "dashboard.genderFemale");
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => handleGender(g)}
                      aria-pressed={active}
                      title={label}
                      className={`flex h-8 items-center gap-1.5 rounded-full px-2.5 text-sm font-bold transition sm:px-3 ${
                        active ? "bg-navy-700 text-white shadow" : "text-navy-500 hover:bg-navy-50"
                      }`}
                    >
                      {g === "male" ? <Mars size={16} /> : <Venus size={16} />}
                      <span className={active ? "hidden sm:inline" : "sr-only"}>{label}</span>
                    </button>
                  );
                })}
              </div>

              <div ref={menuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label={t("dashboard.accountMenu")}
                  disabled={uploading}
                  className="flex items-center gap-1 rounded-full outline-none transition focus-visible:ring-4 focus-visible:ring-navy-200 disabled:opacity-60"
                >
                  {profile?.photoURL ? (
                    <img
                      src={profile.photoURL}
                      alt={profile.displayName}
                      className="h-12 w-12 rounded-full border-2 border-white object-cover shadow-[0_0_0_2px_rgb(var(--color-navy-100))]"
                    />
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-navy-700 text-lg font-bold text-white shadow-[0_0_0_2px_rgb(var(--color-navy-100))]">
                      {profile?.displayName?.[0]?.toUpperCase() || "?"}
                    </span>
                  )}
                  <ChevronDown size={18} className="text-navy-600" />
                </button>

                {menuOpen && (
                  <div
                    role="menu"
                    className="absolute end-0 top-full z-30 mt-2 w-52 rounded-2xl border border-navy-100 bg-white p-1.5 shadow-[0_18px_40px_-16px_rgba(59,34,135,0.5)]"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        fileInputRef.current?.click();
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-navy-700 hover:bg-navy-50"
                    >
                      <Camera size={16} />
                      {t("auth.changePhoto")}
                    </button>
                    {otherPortalPath && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          navigate(otherPortalPath);
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-navy-700 hover:bg-navy-50"
                      >
                        <Repeat size={16} />
                        {otherPortalLabel}
                      </button>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-navy-700 hover:bg-navy-50"
                    >
                      <LogOut size={16} />
                      {t("nav.signOut")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelected} />
        </>
      ) : (
        <header className="z-10 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-cream-400 bg-cream-100/90 px-3 py-3 backdrop-blur sm:px-6 sm:py-4 md:sticky md:top-0">
          <div className="flex min-w-0 items-center gap-3">
            <SchoolLogo size={42} />
            {profile && (
              <p className="truncate text-sm text-cream-600">
                {t("dashboard.welcome", { name: profile.displayName })}
              </p>
            )}
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:gap-3 md:w-auto">
            <ThemeToggle className={ACTION_TONES.violet} />

            <button
              onClick={toggleLanguage}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${ACTION_TONES.blue}`}
              title={t("common.language")}
            >
              <Globe size={14} />
              {i18n.language === "ar" ? "EN" : "AR"}
            </button>

            <button
              onClick={openWhatsappModal}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${ACTION_TONES.emerald}`}
              title={t("settings.whatsappNumber")}
            >
              <MessageCircle size={14} />
              <span className="hidden lg:inline">{t("settings.whatsapp")}</span>
            </button>

            <button
              onClick={openScheduleModal}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${ACTION_TONES.amber}`}
              title={t("ranking.scheduleLabel")}
            >
              <Trophy size={14} />
              <span className="hidden lg:inline">{t("ranking.schedule")}</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoSelected}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title={t("auth.changePhoto")}
              className="relative h-9 w-9 shrink-0 rounded-full group disabled:opacity-60"
            >
              {profile?.photoURL ? (
                <img
                  src={profile.photoURL}
                  alt={profile.displayName}
                  className="h-9 w-9 rounded-full object-cover border border-gold/40"
                />
              ) : (
                <div className="h-9 w-9 rounded-full bg-navy text-cream-100 flex items-center justify-center text-sm font-semibold">
                  {profile?.displayName?.[0]?.toUpperCase() || "?"}
                </div>
              )}
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-navy/50 opacity-0 group-hover:opacity-100 transition">
                <Camera size={14} className="text-cream-100" />
              </span>
            </button>

            {otherPortalPath && (
              <button
                onClick={() => navigate(otherPortalPath)}
                className="flex items-center gap-1.5 rounded-lg border border-gold/40 px-3 py-1.5 text-xs font-semibold text-navy hover:bg-gold-50"
                title={otherPortalLabel}
              >
                <Repeat size={14} />
                <span className="hidden lg:inline">{otherPortalLabel}</span>
              </button>
            )}

            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-navy/70 hover:bg-cream-400/60"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">{t("nav.signOut")}</span>
            </button>
          </div>
        </header>
      )}

      <Modal open={whatsappModalOpen} onClose={() => setWhatsappModalOpen(false)} title={t("settings.whatsappNumber")}>
        <form onSubmit={handleSaveWhatsapp} className="space-y-4">
          <div>
            <label className="label-eyebrow block mb-1.5">{t("settings.whatsappNumber")}</label>
            <input
              type="tel"
              value={whatsappInput}
              onChange={(e) => setWhatsappInput(e.target.value)}
              placeholder={t("settings.whatsappPlaceholder")}
              className="input-field"
            />
            <p className="text-xs text-cream-600 mt-1.5">{t("settings.whatsappHint")}</p>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setWhatsappModalOpen(false)} className="btn-secondary">
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={savingWhatsapp} className="btn-primary">
              {savingWhatsapp ? t("common.loading") : t("common.save")}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={scheduleModalOpen} onClose={() => setScheduleModalOpen(false)} title={t("ranking.scheduleLabel")}>
        <form onSubmit={handleSaveSchedule} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-eyebrow block mb-1.5">{t("ranking.startDate")}</label>
              <input
                type="date"
                required
                value={scheduleStart}
                onChange={(e) => setScheduleStart(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="label-eyebrow block mb-1.5">{t("ranking.endDate")}</label>
              <input
                type="date"
                required
                value={scheduleEnd}
                min={scheduleStart || undefined}
                onChange={(e) => setScheduleEnd(e.target.value)}
                className="input-field"
              />
            </div>
          </div>
          <p className="text-xs text-cream-600">{t("ranking.scheduleHint")}</p>
          {scheduleError && <p className="text-sm text-red-600">{scheduleError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setScheduleModalOpen(false)} className="btn-secondary">
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={savingSchedule} className="btn-primary">
              {savingSchedule ? t("common.loading") : t("common.save")}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
