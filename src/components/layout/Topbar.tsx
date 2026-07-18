import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { LogOut, Globe, Camera } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { uploadToCloudinary } from "../../lib/cloudinary";

export default function Topbar() {
  const { t, i18n } = useTranslation();
  const { profile, signOut, updateTeacherPhoto } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

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
