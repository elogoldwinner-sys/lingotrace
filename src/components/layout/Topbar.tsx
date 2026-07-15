import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { LogOut, Globe } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

export default function Topbar() {
  const { t, i18n } = useTranslation();
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate("/sign-in");
  }

  function toggleLanguage() {
    i18n.changeLanguage(i18n.language === "ar" ? "en" : "ar");
  }

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-cream-400 bg-cream-100/90 backdrop-blur px-6 py-4">
      <div>
        {profile && (
          <p className="text-sm text-cream-600">
            {t("dashboard.welcome", { name: profile.displayName })}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={toggleLanguage}
          className="flex items-center gap-1.5 rounded-lg border border-gold/40 px-3 py-1.5 text-xs font-semibold text-navy hover:bg-gold-50"
          title={t("common.language")}
        >
          <Globe size={14} />
          {i18n.language === "ar" ? "EN" : "AR"}
        </button>
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
        <button
          onClick={handleSignOut}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-navy/70 hover:bg-cream-400/60"
        >
          <LogOut size={14} />
          {t("nav.signOut")}
        </button>
      </div>
    </header>
  );
}
