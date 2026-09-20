import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import Logo from "../common/Logo";
import ThemeToggle from "../common/ThemeToggle";
import { CapIcon, CardBlob, CloudFloor, KID_SKY_BACKGROUND, Sparks } from "./KidHomeArt";
import owl from "../../assets/kid-home/owl.webp";
import sceneLeft from "../../assets/kid-teacher/scene-left.webp";
import sceneRight from "../../assets/kid-teacher/scene-right.webp";

/**
 * Kid-mode "Teacher Portal" sign-in page. Same lavender sky, owl, name and
 * Classic-mode switch as the kid homepage; the two teachers' classroom scenes
 * flank a single Teacher Portal card. Clicking the card (or its arrow) starts
 * the Google sign-in that the classic page starts with its button.
 *
 * The scenes are pre-faded on their inner edge so they melt into the sky, and
 * are placed with physical left/right utilities so Arabic (RTL) looks the same.
 */
export default function KidTeacherLogin({
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
      {/* ───────────── scenery (decorative, behind the content) ───────────── */}
      <div className="pointer-events-none absolute inset-0 select-none" aria-hidden="true">
        <CloudFloor className="absolute inset-x-0 bottom-0 h-auto w-full" />
        <img
          src={sceneLeft}
          alt=""
          className="absolute bottom-0 left-0 h-auto w-[min(50vw,340px)] lg:h-[min(100vh,50vw)] lg:w-auto lg:max-w-none"
        />
        <img
          src={sceneRight}
          alt=""
          className="absolute bottom-0 right-0 h-auto w-[min(50vw,340px)] lg:h-[min(100vh,50vw)] lg:w-auto lg:max-w-none"
        />
      </div>

      {/* mode switch (top-right) */}
      <div className="absolute right-3 top-3 z-20 sm:right-4 sm:top-4 lg:right-[1.6vw] lg:top-[2.6vw]">
        <ThemeToggle variant="pill" />
      </div>

      {/* ───────────── content ───────────── */}
      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-[34rem] flex-col items-center justify-center px-4 pb-[calc(min(50vw,340px)*1.4)] pt-20 text-center lg:max-w-[clamp(20rem,34vw,44rem)] lg:pb-12 lg:pt-12">
        <div className="relative">
          <img src={owl} alt="" className="block w-[clamp(64px,7.4vw,128px)]" />
          <Sparks className="absolute -left-7 top-[46%] h-11 -translate-y-1/2 lg:-left-10 lg:h-14" />
          <Sparks flip className="absolute -right-7 top-[46%] h-11 -translate-y-1/2 lg:-right-10 lg:h-14" />
        </div>

        {/* app name — also the way back to the home page */}
        <Link
          to="/"
          aria-label={t("common.backToHome")}
          className="mt-2 flex items-center justify-center gap-2 rounded-full outline-none focus-visible:ring-4 focus-visible:ring-navy-300"
        >
          <Logo size={52} />
          <span className="font-serif text-[clamp(1.75rem,2.6vw,2.6rem)] font-extrabold text-navy-700">
            {t("app.name")}
          </span>
        </Link>

        <h1 className="mt-1 text-[clamp(2.1rem,3.9vw,3.8rem)] font-extrabold leading-[1.1] text-navy-700 [text-shadow:0_3px_0_rgba(255,255,255,0.9)]">
          {t("home.teacherPortal")}
        </h1>
        <p className="mt-3 text-[clamp(1rem,1.5vw,1.4rem)] font-semibold text-cream-600">
          {t("home.teacherPortalDesc")}
        </p>

        {error && (
          <div
            role="alert"
            className="mt-6 w-full rounded-2xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
          >
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={onSignIn}
          disabled={submitting}
          aria-busy={submitting}
          aria-label={t("auth.continueWithGoogle")}
          title={t("auth.continueWithGoogle")}
          className="group relative mt-7 w-full overflow-hidden rounded-[2.25rem] border-[3px] border-b-[7px] border-[#E0D2FC] border-b-[#C3A6F5] bg-gradient-to-b from-white to-[#F6F1FF] px-6 pb-8 pt-8 text-center shadow-[0_0_0_5px_rgba(196,178,250,0.28),0_24px_40px_-22px_rgba(101,58,205,0.55)] outline-none transition-transform duration-200 ease-bouncy hover:-translate-y-1.5 focus-visible:ring-4 focus-visible:ring-navy-300 disabled:cursor-wait disabled:hover:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0 lg:mt-9"
        >
          <CardBlob className="pointer-events-none absolute left-0 top-0 h-20 w-20 text-[#E8DCFF]/80" />
          <CardBlob className="pointer-events-none absolute bottom-0 left-0 h-24 w-24 -rotate-90 text-[#E8DCFF]/80" />
          <CardBlob className="pointer-events-none absolute bottom-0 right-0 h-28 w-28 rotate-180 text-[#E8DCFF]/80" />

          <span className="relative z-10 flex w-full flex-col items-center">
            <span className="relative">
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-b from-[#6C41CE] to-[#4522A6] shadow-[0_12px_20px_-10px_rgba(69,34,166,0.8)] sm:h-24 sm:w-24">
                <CapIcon className="h-11 w-11 sm:h-14 sm:w-14" />
              </span>
              <Sparks className="absolute -left-9 top-1/2 h-9 -translate-y-1/2" />
              <Sparks flip className="absolute -right-9 top-1/2 h-9 -translate-y-1/2" />
            </span>

            <span className="mt-4 block font-serif text-[1.65rem] font-extrabold leading-tight text-navy-700 sm:text-[1.9rem]">
              {t("home.teacherPortal")}
            </span>
            <span className="mx-auto mt-2 block max-w-[20rem] text-base font-semibold leading-snug text-cream-600">
              {t("home.teacherPortalDesc")}
            </span>

            <span className="mt-5 flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-b from-[#6C41CE] to-[#4522A6] text-white shadow-[0_8px_14px_-6px_rgba(69,34,166,0.7)] transition-transform duration-200 group-hover:translate-x-1 group-disabled:translate-x-0 rtl:group-hover:-translate-x-1 motion-reduce:transition-none">
              {submitting ? (
                <span
                  className="h-5 w-5 animate-spin rounded-full border-[3px] border-white/40 border-t-white motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : (
                <ArrowRight size={22} strokeWidth={3} className="rtl:-scale-x-100" aria-hidden="true" />
              )}
            </span>
          </span>
        </button>
      </main>
    </div>
  );
}
