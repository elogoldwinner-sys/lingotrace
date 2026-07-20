import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { LogOut, Globe, Camera, MessageCircle } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { uploadToCloudinary } from "../../lib/cloudinary";
import Modal from "../common/Modal";

export default function Topbar() {
  const { t, i18n } = useTranslation();
  const { profile, signOut, updateTeacherPhoto, updateTeacherWhatsapp } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
  const [whatsappInput, setWhatsappInput] = useState("");
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);

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

        <button
          onClick={openWhatsappModal}
          className="flex items-center gap-1.5 rounded-lg border border-gold/40 px-3 py-1.5 text-xs font-semibold text-navy hover:bg-gold-50"
          title={t("settings.whatsappNumber")}
        >
          <MessageCircle size={14} />
          {t("settings.whatsapp")}
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
    </header>
  );
}
