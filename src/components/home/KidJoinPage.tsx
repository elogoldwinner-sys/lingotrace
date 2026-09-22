import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import Logo from "../common/Logo";
import { KID_SKY_BACKGROUND, Star } from "../home/KidHomeArt";
import sceneFamily from "../../assets/kid-join/scene-family.webp";
import sceneOwl from "../../assets/kid-join/scene-owl.webp";

/** Google's four-colour "G" mark, exactly as used on the classic Join page. */
function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.03l3-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
    </svg>
  );
}

/**
 * Kid-mode "Join" page: the family scene and the reading owl flank a single
 * white card that carries the actual LingoTrace branding (cookie logo + the
 * same graduation-cap owl mascot used on the other kid-mode pages) rather
 * than the mismatched face-icon from the original design reference — so this
 * page reads as the same product as the homepage and the two portal logins.
 *
 * Layout, copy and behaviour (select-child, Continue with Google, error
 * banner, sign-in link) are unchanged from the classic Join page; only the
 * skin differs. Scenes use physical left/right so Arabic (RTL) mirrors the
 * card and swaps which scene sits on which side while staying legible.
 */
export default function KidJoinPage({
  isParent,
  title,
  subtitle,
  error,
  children,
  onSubmit,
  submitLabel,
  submitting,
  canSubmit,
}: {
  isParent: boolean;
  title: string;
  subtitle: string;
  error?: string;
  /** The select-your-child field (parent invites only) — passed in so JoinPage keeps owning its state. */
  children?: ReactNode;
  onSubmit: () => void;
  submitLabel: string;
  submitting: boolean;
  canSubmit: boolean;
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

      {/* ───────────── card ───────────── */}
      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-[30rem] items-center justify-center px-4 py-10 lg:max-w-[34rem]">
        <div className="w-full rounded-[2rem] border border-white bg-white/95 p-7 shadow-[0_28px_48px_-24px_rgba(90,60,200,0.55)] sm:p-9">
          <div className="mb-5 flex items-center gap-2">
            <Logo size={40} />
            <span className="font-serif text-2xl font-extrabold text-navy-700">{t("app.name")}</span>
          </div>

          <h1 className="font-serif text-[1.9rem] font-extrabold leading-tight text-navy-700 sm:text-[2.1rem]">
            {title}
          </h1>
          <p className="mt-1.5 text-base font-semibold text-cream-600">{subtitle}</p>

          {error && (
            <div
              role="alert"
              className="mt-5 rounded-2xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
            >
              {error}
            </div>
          )}

          {isParent && <div className="mt-6">{children}</div>}

          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting || !canSubmit}
            className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-2xl bg-navy-50 py-3.5 text-base font-bold text-navy-700 transition hover:-translate-y-0.5 hover:bg-navy-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            <GoogleIcon />
            {submitLabel}
          </button>

          <p className="mt-6 text-center text-sm font-semibold text-cream-600">
            {t("join.haveAccountAlready")}{" "}
            <Link to="/portal-login" className="font-extrabold text-gold-600 hover:underline">
              {t("auth.portalLoginLink")}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

/** The "SELECT YOUR CHILD" field — kept separate so JoinPage can pass its own <select>. */
export function KidJoinChildField({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-xs font-extrabold uppercase tracking-wide text-gold-600">{label}</label>
      <div className="relative">
        {children}
        <ChevronDown
          size={18}
          className="pointer-events-none absolute end-4 top-1/2 -translate-y-1/2 text-navy-500"
          aria-hidden="true"
        />
      </div>
      <p className="mt-2 text-xs font-semibold text-cream-600">{hint}</p>
    </div>
  );
}
