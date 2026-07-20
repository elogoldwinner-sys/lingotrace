import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, Users, CalendarCheck, Megaphone, Image as ImageIcon, Video, X, Loader2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { subscribeToClasses } from "../lib/services/classesService";
import { subscribeToStudentCounts } from "../lib/services/studentsService";
import {
  subscribeToAnnouncement,
  saveAnnouncement,
  clearAnnouncement,
} from "../lib/services/announcementsService";
import { uploadToCloudinary } from "../lib/cloudinary";
import type { ClassRecord, Announcement } from "../types";
import AnnouncementCard from "../components/common/AnnouncementCard";
import Modal from "../components/common/Modal";

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="card flex items-center gap-4 p-5">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold-50 text-gold">
        {icon}
      </div>
      <div>
        <p className="label-eyebrow">{label}</p>
        <p className="font-serif text-2xl font-semibold text-navy">{value}</p>
      </div>
    </div>
  );
}

function AnnouncementEditor({
  announcement,
  onClose,
}: {
  announcement: Announcement | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [text, setText] = useState(announcement?.text || "");
  const [imageUrl, setImageUrl] = useState(announcement?.imageUrl || "");
  const [videoUrl, setVideoUrl] = useState(announcement?.videoUrl || "");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  async function handleImageSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingImage(true);
    setError("");
    try {
      const result = await uploadToCloudinary(file, "lingotrace/announcements", "image");
      setImageUrl(result.secure_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleVideoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingVideo(true);
    setError("");
    try {
      const result = await uploadToCloudinary(file, "lingotrace/announcements", "video");
      setVideoUrl(result.secure_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadingVideo(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() && !imageUrl && !videoUrl) {
      setError(t("announcement.errorEmpty"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      await saveAnnouncement({
        text: text.trim(),
        imageUrl: imageUrl || undefined,
        videoUrl: videoUrl || undefined,
        postedByName: profile?.displayName || "",
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setSaving(true);
    try {
      await clearAnnouncement();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div>
        <label className="label-eyebrow block mb-1.5">{t("announcement.textLabel")}</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder={t("announcement.textPlaceholder")}
          className="input-field resize-none"
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageSelected}
        />
        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          disabled={uploadingImage}
          className="btn-secondary py-1.5 px-3 text-sm"
        >
          {uploadingImage ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
          {imageUrl ? t("announcement.replaceImage") : t("announcement.addImage")}
        </button>

        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleVideoSelected}
        />
        <button
          type="button"
          onClick={() => videoInputRef.current?.click()}
          disabled={uploadingVideo}
          className="btn-secondary py-1.5 px-3 text-sm"
        >
          {uploadingVideo ? <Loader2 size={16} className="animate-spin" /> : <Video size={16} />}
          {videoUrl ? t("announcement.replaceVideo") : t("announcement.addVideo")}
        </button>
      </div>

      {imageUrl && (
        <div className="relative inline-block">
          <img src={imageUrl} alt="" className="max-h-40 rounded-lg" />
          <button
            type="button"
            onClick={() => setImageUrl("")}
            className="absolute -top-2 -end-2 bg-navy text-cream-100 rounded-full p-1"
            title={t("common.delete")}
          >
            <X size={12} />
          </button>
        </div>
      )}

      {videoUrl && (
        <div className="relative inline-block">
          <video src={videoUrl} className="max-h-40 rounded-lg" controls />
          <button
            type="button"
            onClick={() => setVideoUrl("")}
            className="absolute -top-2 -end-2 bg-navy text-cream-100 rounded-full p-1"
            title={t("common.delete")}
          >
            <X size={12} />
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-between items-center pt-2">
        {announcement ? (
          <button
            type="button"
            onClick={handleRemove}
            disabled={saving}
            className="text-sm font-semibold text-red-600 hover:text-red-700"
          >
            {t("announcement.remove")}
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={saving || uploadingImage || uploadingVideo} className="btn-primary">
            {saving ? t("common.loading") : t("common.save")}
          </button>
        </div>
      </div>
    </form>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToClasses(user.uid, setClasses, console.error);
    return unsubscribe;
  }, [user]);

  useEffect(() => {
    const classIds = classes.map((c) => c.id);
    const unsubscribe = subscribeToStudentCounts(classIds, setStudentCounts, console.error);
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes.map((c) => c.id).join(",")]);

  useEffect(() => {
    const unsubscribe = subscribeToAnnouncement(setAnnouncement);
    return unsubscribe;
  }, []);

  const totalStudents = classes.reduce(
    (sum, c) => sum + (studentCounts[c.id] || 0),
    0
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-navy">{t("dashboard.title")}</h1>

      <div>
        {announcement ? (
          <div className="space-y-2">
            <AnnouncementCard announcement={announcement} />
            <button
              onClick={() => setEditorOpen(true)}
              className="text-sm font-semibold text-gold hover:text-gold-700"
            >
              {t("announcement.edit")}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditorOpen(true)}
            className="card w-full p-5 flex items-center gap-3 text-cream-600 hover:text-navy hover:border-gold/40 border border-dashed border-cream-400 transition"
          >
            <Megaphone size={20} />
            <span className="text-sm font-semibold">{t("announcement.post")}</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={<BookOpen size={22} />}
          label={t("dashboard.totalClasses")}
          value={classes.length}
        />
        <StatCard
          icon={<Users size={22} />}
          label={t("dashboard.totalStudents")}
          value={totalStudents}
        />
        <StatCard
          icon={<CalendarCheck size={22} />}
          label={t("dashboard.todayAttendance")}
          value="—"
        />
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-semibold text-navy mb-4">
          {t("classes.title")}
        </h2>
        {classes.length === 0 ? (
          <p className="text-sm text-cream-600">{t("classes.noClasses")}</p>
        ) : (
          <ul className="divide-y divide-cream-400">
            {classes.map((c) => (
              <li key={c.id} className="py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-navy">{c.name}</p>
                  {c.description && (
                    <p className="text-sm text-cream-600">{c.description}</p>
                  )}
                </div>
                <span className="pill bg-gold-50 text-gold">
                  {studentCounts[c.id] || 0} {t("classes.students")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal open={editorOpen} onClose={() => setEditorOpen(false)} title={t("announcement.title")}>
        <AnnouncementEditor announcement={announcement} onClose={() => setEditorOpen(false)} />
      </Modal>
    </div>
  );
}
