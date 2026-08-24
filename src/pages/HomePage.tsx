import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { GraduationCap, Heart } from "lucide-react";
import Logo from "../components/common/Logo";
import ThemeToggle from "../components/common/ThemeToggle";

export default function HomePage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4 py-12 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-2xl text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Logo size={40} />
          <span className="font-serif text-2xl font-semibold text-navy">{t("app.name")}</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold text-navy mb-2">
          {t("home.welcome", { appName: t("app.name") })}
        </h1>
        <p className="text-sm text-cream-600 mb-10">{t("home.subtitle")}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Link
            to="/login"
            className="card p-8 flex flex-col items-center gap-3 hover:shadow-md hover:border-gold/40 border border-transparent transition"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-navy text-gold">
              <GraduationCap size={30} />
            </div>
            <h2 className="text-lg font-semibold text-navy">{t("home.teacherPortal")}</h2>
            <p className="text-sm text-cream-600">{t("home.teacherPortalDesc")}</p>
          </Link>

          <Link
            to="/portal-login"
            className="card p-8 flex flex-col items-center gap-3 hover:shadow-md hover:border-gold/40 border border-transparent transition"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gold-50 text-gold">
              <Heart size={30} />
            </div>
            <h2 className="text-lg font-semibold text-navy">{t("home.parentPortal")}</h2>
            <p className="text-sm text-cream-600">{t("home.parentPortalDesc")}</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
