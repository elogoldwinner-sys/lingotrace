import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import Logo from "../common/Logo";
import ThemeToggle from "../common/ThemeToggle";
import {
  CapIcon,
  CardBlob,
  CloudFloor,
  CloudLeft,
  CloudRight,
  HeartRibbonIcon,
  KID_SKY_BACKGROUND,
  PurpleHill,
  Sparks,
  Star,
} from "./KidHomeArt";
import owl from "../../assets/kid-home/owl.webp";
import boy from "../../assets/kid-home/boy.webp";
import girl from "../../assets/kid-home/girl.webp";
import balloon from "../../assets/kid-home/balloon.webp";
import rocket from "../../assets/kid-home/rocket.webp";
import books from "../../assets/kid-home/books.webp";
import globe from "../../assets/kid-home/globe.webp";

/**
 * Kid-mode homepage: a lavender sky with clouds, the owl mascot, the app name,
 * "Welcome to …" and the two sign-in cards (Teacher / Parent). Balloon, rocket,
 * stars, the two children, the book stack and the globe are decoration only.
 *
 * Art is positioned with physical left/right utilities on purpose: the scene
 * looks the same in Arabic (RTL) as in English.
 */
type Tone = "teacher" | "parent";

const TONES: Record<
  Tone,
  { card: string; blob: string; disc: string; arrow: string; ring: string }
> = {
  teacher: {
    card: "border-[#E4D5FD] border-b-[#B98BF1] bg-gradient-to-b from-white to-[#F5F0FF] shadow-[0_22px_36px_-20px_rgba(101,58,205,0.55)]",
    blob: "text-[#E8DCFF]/80",
    disc: "bg-gradient-to-b from-[#6C41CE] to-[#4522A6] shadow-[0_12px_20px_-10px_rgba(69,34,166,0.8)]",
    arrow: "bg-gradient-to-b from-[#6C41CE] to-[#4522A6] shadow-[0_8px_14px_-6px_rgba(69,34,166,0.7)]",
    ring: "focus-visible:ring-navy-300",
  },
  parent: {
    card: "border-[#FFE6AE] border-b-[#FFB020] bg-gradient-to-b from-[#FFFDF7] to-[#FFF8E7] shadow-[0_22px_36px_-20px_rgba(255,152,0,0.6)]",
    blob: "text-[#FFE7A6]/80",
    disc: "bg-gradient-to-b from-[#FFF1C7] to-[#FFDD86]",
    arrow: "bg-gradient-to-b from-[#FFBE3D] to-[#FF9A00] shadow-[0_8px_14px_-6px_rgba(255,152,0,0.75)]",
    ring: "focus-visible:ring-gold-300",
  },
};

function PortalCard({
  to,
  tone,
  icon,
  title,
  desc,
}: {
  to: string;
  tone: Tone;
  icon: ReactNode;
  title: string;
  desc: string;
}) {
  const s = TONES[tone];
  return (
    <Link
      to={to}
      className={`group relative flex flex-col items-center overflow-hidden rounded-[2.25rem] border-x-[3px] border-t-[3px] border-b-[8px] px-6 pb-7 pt-8 text-center outline-none transition-transform duration-200 ease-bouncy hover:-translate-y-1.5 focus-visible:ring-4 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${s.card} ${s.ring}`}
    >
      <CardBlob className={`pointer-events-none absolute left-0 top-0 h-20 w-20 ${tone === "teacher" ? "" : "hidden"} ${s.blob}`} />
      <CardBlob className={`pointer-events-none absolute right-0 top-0 h-20 w-20 rotate-90 ${tone === "parent" ? "" : "hidden"} ${s.blob}`} />
      <CardBlob className={`pointer-events-none absolute bottom-0 left-0 h-24 w-24 -rotate-90 ${s.blob}`} />
      <CardBlob className={`pointer-events-none absolute bottom-0 right-0 h-28 w-28 rotate-180 ${s.blob}`} />

      <div className="relative z-10 flex w-full flex-col items-center">
        <div className="relative">
          <div className={`flex h-20 w-20 items-center justify-center rounded-full sm:h-24 sm:w-24 ${s.disc}`}>
            {icon}
          </div>
          <Sparks className="absolute -left-9 top-1/2 h-9 -translate-y-1/2" />
          <Sparks flip className="absolute -right-9 top-1/2 h-9 -translate-y-1/2" />
        </div>

        <h2 className="mt-4 text-[1.65rem] font-extrabold leading-tight text-navy-700 sm:text-[1.9rem]">
          {title}
        </h2>
        <p className="mt-2 max-w-[16rem] text-base font-semibold leading-snug text-cream-600">{desc}</p>

        <span
          className={`mt-5 flex h-11 w-11 items-center justify-center rounded-full text-white transition-transform duration-200 group-hover:translate-x-1 rtl:group-hover:-translate-x-1 motion-reduce:transition-none ${s.arrow}`}
        >
          <ArrowRight size={22} strokeWidth={3} className="rtl:-scale-x-100" aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}

export default function KidHome() {
  const { t } = useTranslation();

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: KID_SKY_BACKGROUND }}>
      {/* ───────────── scenery (decorative, behind the content) ───────────── */}
      <div className="pointer-events-none absolute inset-0 select-none" aria-hidden="true">
        <CloudFloor className="absolute inset-x-0 bottom-0 h-auto w-full" />

        {/* balloon (top-left) and rocket (top-right, beside the mode switch) */}
        <img
          src={balloon}
          alt=""
          className="absolute left-3 top-3 w-9 sm:w-12 lg:left-[1.5vw] lg:top-[3.5%] lg:w-[clamp(84px,9.3vw,172px)]"
        />
        <img
          src={rocket}
          alt=""
          className="absolute right-[9.75rem] top-3 w-9 sm:right-[11rem] sm:w-11 lg:right-[16vw] lg:top-[6.5%] lg:w-[clamp(64px,7.6vw,141px)]"
        />

        {/* stars */}
        <Star className="absolute left-[21.5vw] top-[7%] hidden w-[clamp(18px,2.1vw,40px)] lg:block" />
        <Star className="absolute left-[65.5vw] top-[13%] hidden w-[clamp(26px,3.3vw,62px)] lg:block" />
        <Star className="absolute left-[2vw] top-[38%] hidden w-[clamp(22px,2.6vw,48px)] lg:block" />
        <Star className="absolute left-[13.2vw] top-[67%] hidden w-[clamp(28px,3.6vw,68px)] lg:block" />
        <Star className="absolute left-[82vw] top-[72%] hidden w-[clamp(24px,3.1vw,58px)] lg:block" />
        <Star className="absolute -right-[0.4vw] top-[35%] hidden w-[clamp(20px,2.3vw,42px)] lg:block" />

        {/* boy peeking over a cloud (left) */}
        <div className="absolute left-[1vw] top-16 w-[27vw] max-w-[150px] lg:left-[5.6vw] lg:top-[17%] lg:w-[clamp(200px,19.5vw,362px)] lg:max-w-none">
          <img src={boy} alt="" className="block w-full" />
          <CloudLeft className="absolute -bottom-[26%] -left-[12%] w-[128%] max-w-none [mask-image:linear-gradient(to_bottom,#000_62%,transparent_96%)]" />
        </div>

        {/* girl waving over a cloud (right) */}
        <div className="absolute right-[1vw] top-16 w-[27vw] max-w-[150px] lg:right-[2.8vw] lg:top-[22%] lg:w-[clamp(210px,20.8vw,387px)] lg:max-w-none">
          <img src={girl} alt="" className="block w-full" />
          <CloudRight className="absolute -bottom-[26%] -right-[12%] w-[128%] max-w-none [mask-image:linear-gradient(to_bottom,#000_62%,transparent_96%)]" />
        </div>

        {/* purple hill + globe (bottom-right) */}
        <PurpleHill className="absolute bottom-0 right-0 hidden h-auto w-[clamp(200px,22vw,420px)] [mask-image:linear-gradient(to_bottom,#000_70%,transparent_100%)] lg:block" />
        <img
          src={globe}
          alt=""
          className="absolute bottom-0 right-0 w-[26vw] max-w-[140px] lg:w-[clamp(180px,17.6vw,327px)] lg:max-w-none"
        />

        {/* books, pencils and plants (bottom-left) */}
        <img
          src={books}
          alt=""
          className="absolute bottom-0 left-0 w-[24vw] max-w-[130px] lg:w-[clamp(200px,18.8vw,350px)] lg:max-w-none"
        />
      </div>

      {/* mode switch (top-right) */}
      <div className="absolute right-3 top-3 z-20 sm:right-4 sm:top-4 lg:right-[1.6vw] lg:top-[2.6vw]">
        <ThemeToggle variant="pill" />
      </div>

      {/* ───────────── content ───────────── */}
      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-[34rem] flex-col items-center justify-center px-4 pb-28 pt-20 text-center sm:max-w-[42rem] lg:max-w-[clamp(36rem,55vw,66rem)] lg:pb-12 lg:pt-12">
        <div className="relative">
          <img src={owl} alt="" className="block w-[clamp(64px,7.4vw,128px)]" />
          <Sparks className="absolute -left-7 top-[46%] h-11 -translate-y-1/2 lg:-left-10 lg:h-14" />
          <Sparks flip className="absolute -right-7 top-[46%] h-11 -translate-y-1/2 lg:-right-10 lg:h-14" />
        </div>

        <div className="mt-2 flex items-center justify-center gap-2">
          <Logo size={52} />
          <span className="font-serif text-[clamp(1.75rem,2.6vw,2.6rem)] font-extrabold text-navy-700">
            {t("app.name")}
          </span>
        </div>

        <div className="relative mt-1 inline-block max-w-full px-12 sm:px-16">
          <Sparks className="absolute left-0 top-1/2 h-10 -translate-y-1/2 sm:h-12" />
          <h1 className="text-[clamp(1.85rem,3.7vw,3.6rem)] font-extrabold leading-[1.1] text-navy-700 [text-shadow:0_3px_0_rgba(255,255,255,0.9)]">
            {t("home.welcome", { appName: t("app.name") })}
          </h1>
          <Sparks flip className="absolute right-0 top-1/2 h-10 -translate-y-1/2 sm:h-12" />
        </div>

        <p className="mt-3 text-[clamp(1rem,1.5vw,1.4rem)] font-semibold text-cream-600">
          {t("home.subtitle")}
        </p>

        <div className="mt-7 grid w-full grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:mt-9 lg:gap-8">
          <PortalCard
            to="/login"
            tone="teacher"
            icon={<CapIcon className="h-11 w-11 sm:h-14 sm:w-14" />}
            title={t("home.teacherPortal")}
            desc={t("home.teacherPortalDesc")}
          />
          <PortalCard
            to="/portal-login"
            tone="parent"
            icon={<HeartRibbonIcon className="h-11 w-11 sm:h-14 sm:w-14" />}
            title={t("home.parentPortal")}
            desc={t("home.parentPortalDesc")}
          />
        </div>
      </main>
    </div>
  );
}
