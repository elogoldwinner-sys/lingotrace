import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { LogOut, Globe, Camera, ChevronDown, Repeat } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { uploadToCloudinary } from "../../lib/cloudinary";
import { ACTION_TONES } from "../../lib/uiColors";
import ThemeToggle from "../common/ThemeToggle";
import SchoolLogo from "./SchoolLogo";
import { useTheme } from "../../contexts/ThemeContext";
import type { TeacherGender } from "../../types";

/** "Mahmoud Badawi" → "Badawi" (the design greets teachers as "Ms. Ahmed"). */
function familyName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  return parts[parts.length - 1] || displayName;
}

const KID_TONES = {
  blue: "!border-blue-300 !bg-blue-50 !text-blue-800 hover:!bg-blue-100",
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
    </>
  );
}
