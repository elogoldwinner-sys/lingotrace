import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Logo from "../common/Logo";
import { GoogleIcon } from "./KidJoinPage";
import { KID_SKY_BACKGROUND, Star } from "./KidHomeArt";
import sceneFamily from "../../assets/kid-join/scene-family.webp";
import sceneOwl from "../../assets/kid-join/scene-owl.webp";

/**
 * Kid-mode Portal Login: the return sign-in for students AND parents alike
 * (unlike the Join page, which is per-invite and role-specific), so it reuses
 * the same family + reading-owl scenery from KidJoinPage rather than new,
 * role-specific art — one scene reads "parent", the other reads "student",
 * together covering both without favouring either.
 *
 * Same card shell, branding and copy pattern as KidJoinPage: cookie logo +
 * app name inside the card, heading, subtitle, error banner, Continue with
 * Google, and the two footer lines. A physically-positioned "Back to home"
 * link sits above the card, as on the classic page.
 */
export default function KidPortalLoginPage({
  onSignIn,
  submitting,
  error,
}: {
  onSignIn: () => void;
  submitting: boolean;
  error: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: KID_SKY_BACKGROUND }}>
      {/* ───────────── scenery (decorative, behind the card) ───────────── */}
      <div className="pointer-events-none absolute inset-0 select-none" aria-hidden="true">
        <img
          src={sceneFamily}
          alt=""
          className="absolute bottom-0 left-0 h-auto w-[min(48vw,320px)] lg:h-[min(100vh,44vw)] lg:w-auto lg:max-w-none"
        />
        <img
          src={sceneOwl}
          alt=""
          className="absolute bottom-0 right-0 h-auto w-[min(48vw,320px)] lg:h-[min(100vh,44vw)] lg:w-auto lg:max-w-none"
        />
        <Star className="absolute left-[24%] top-[9%] hidden w-9 lg:block" />
        <Star className="absolute right-[13%] top-[6%] hidden w-7 lg:block" />
        <Star className="absolute right-[6%] top-[38%] hidden w-6 lg:block" />
        <Star className="absolute left-[3%] top-[62%] hidden w-6 lg:block" />
      </div>

      {/* ───────────── content ───────────── */}
      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-[30rem] flex-col items-center justify-center px-4 py-10 lg:max-w-[34rem]">
        <Link
          to="/"
          className="mb-4 flex w-full items-center gap-1.5 text-sm font-bold text-navy-600 outline-none transition hover:text-navy-800 focus-visible:ring-4 focus-visible:ring-navy-300 rounded-full"
        >
          <ArrowLeft size={16} className="rtl:-scale-x-100" aria-hidden="true" />
          {t("common.backToHome")}
        </Link>

        <div className="w-full rounded-[2rem] border border-white bg-white/95 p-7 text-center shadow-[0_28px_48px_-24px_rgba(90,60,200,0.55)] sm:p-9">
          <div className="mb-5 flex items-center justify-center gap-2">
            <Logo size={40} />
            <span className="font-serif text-2xl font-extrabold text-navy-700">{t("app.name")}</span>
          </div>

          <h1 className="font-serif text-[1.9rem] font-extrabold leading-tight text-navy-700 sm:text-[2.1rem]">
            {t("auth.portalWelcomeBack")}
          </h1>
          <p className="mt-1.5 text-base font-semibold text-cream-600">{t("auth.portalWelcomeBackSub")}</p>

          {error && (
            <div
              role="alert"
              className="mt-5 rounded-2xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
            >
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={onSignIn}
            disabled={submitting}
            className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-2xl bg-navy-50 py-3.5 text-base font-bold text-navy-700 transition hover:-translate-y-0.5 hover:bg-navy-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            <GoogleIcon />
            {submitting ? t("common.loading") : t("auth.continueWithGoogle")}
          </button>

          <p className="mt-6 text-sm font-semibold text-cream-600">{t("auth.noPortalAccount")}</p>
          <p className="mt-2 text-sm font-semibold text-cream-600">
            {t("auth.areYouATeacher")}{" "}
            <Link to="/login" className="font-extrabold text-gold-600 hover:underline">
              {t("auth.teacherLoginLink")}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
