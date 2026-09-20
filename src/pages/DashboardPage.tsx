import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, Users, CalendarCheck, Megaphone, Image as ImageIcon, Video, X, Loader2, Plus, ImagePlus } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { subscribeToClasses } from "../lib/services/classesService";
import { subscribeToStudentCounts } from "../lib/services/studentsService";
import {
  subscribeToAnnouncements,
  saveAnnouncement,
  deleteAnnouncement,
  isAnnouncementOwnedBy,
  normalizeAnnouncementUrl,
} from "../lib/services/announcementsService";
import { computeAndSaveRankingsForClasses, getDefaultRankingPeriod } from "../lib/services/classRankingsService";
import { triggerWeeklyChampionsCelebration } from "../lib/confetti";
import { uploadToCloudinary } from "../lib/cloudinary";
import type { ClassRecord, Announcement, AnnouncementLink } from "../types";
import AnnouncementCard from "../components/common/AnnouncementCard";
import Modal from "../components/common/Modal";
import RichTextEditor from "../components/common/RichTextEditor";
import { plainTextToHtml, richHtmlToPlainText, sanitizeRichHtml } from "../lib/richText";

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

const MAX_ANNOUNCEMENT_ICONS = 8;

/** One clickable-icon row while it's being edited (not yet saved). `key` is a stable React key; `uploading` blocks saving until the icon image has finished uploading. */
interface IconDraft {
  key: string;
  iconUrl: string;
  url: string;
  label: string;
  uploading: boolean;
}

let iconDraftCounter = 0;
function newIconDraft(link?: AnnouncementLink): IconDraft {
  iconDraftCounter += 1;
  return {
    key: `icon-${iconDraftCounter}`,
    iconUrl: link?.iconUrl || "",
    url: link?.url || "",
    label: link?.label || "",
    uploading: false,
  };
}

function IconRow({
  draft,
  onChange,
  onRemove,
  onError,
}: {
  draft: IconDraft;
  onChange: (patch: Partial<IconDraft>) => void;
  onRemove: () => void;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleIconSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    onChange({ uploading: true });
    try {
      const result = await uploadToCloudinary(file, "lingotrace/announcements/icons", "image");
      onChange({ iconUrl: result.secure_url, uploading: false });
    } catch (err) {
      onChange({ uploading: false });
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-cream-400 bg-white p-3">
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleIconSelected} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={draft.uploading}
        title={draft.iconUrl ? t("announcement.replaceIcon") : t("announcement.uploadIcon")}
        className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-cream-400 bg-cream-100 text-cream-600 hover:border-gold hover:text-navy"
      >
        {draft.uploading ? (
          <Loader2 size={18} className="animate-spin" />
        ) : draft.iconUrl ? (
          <img src={draft.iconUrl} alt="" className="h-full w-full object-contain p-1" />
        ) : (
          <ImagePlus size={20} />
        )}
      </button>

      <div className="flex-1 min-w-0 space-y-2">
        <input
          type="text"
          dir="ltr"
          inputMode="url"
          value={draft.url}
          onChange={(e) => onChange({ url: e.target.value })}
          placeholder={t("announcement.iconUrlPlaceholder")}
          className="input-field"
        />
        <input
          type="text"
          value={draft.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder={t("announcement.iconLabelPlaceholder")}
          maxLength={40}
          className="input-field"
        />
      </div>

      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded-full p-1 text-cream-600 hover:bg-cream-300 hover:text-navy"
        title={t("announcement.removeIcon")}
      >
        <X size={16} />
      </button>
    </div>
  );
}

function AnnouncementEditor({
  announcement,
  classes,
  onClose,
}: {
  /** The announcement being edited, or `null` to write a new one. */
  announcement: Announcement | null;
  /** The teacher's own classes — the choices for "who sees this". */
  classes: ClassRecord[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  // Formatted body (HTML). Announcements posted before formatting existed only have plain text — converted so they open with their line breaks.
  const [textHtml, setTextHtml] = useState(
    () => announcement?.textHtml || plainTextToHtml(announcement?.text || "")
  );
  const [imageUrl, setImageUrl] = useState(announcement?.imageUrl || "");
  const [videoUrl, setVideoUrl] = useState(announcement?.videoUrl || "");
  const [icons, setIcons] = useState<IconDraft[]>(() => (announcement?.links || []).map((l) => newIconDraft(l)));
  const [audience, setAudience] = useState<"all" | "classes">(
    announcement?.classIds && announcement.classIds.length > 0 ? "classes" : "all"
  );
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>(announcement?.classIds || []);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const uploadingIcon = icons.some((i) => i.uploading);

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

  function updateIcon(key: string, patch: Partial<IconDraft>) {
    setIcons((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }

  function toggleClass(classId: string) {
    setSelectedClassIds((prev) =>
      prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId]
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    // Icons: a completely blank row is just dropped; a half-filled one is an error.
    const links: AnnouncementLink[] = [];
    for (const icon of icons) {
      const isBlank = !icon.iconUrl && !icon.url.trim() && !icon.label.trim();
      if (isBlank) continue;
      if (!icon.iconUrl || !icon.url.trim()) {
        setError(t("announcement.errorIconIncomplete"));
        return;
      }
      const href = normalizeAnnouncementUrl(icon.url);
      if (!href) {
        setError(t("announcement.errorIconUrl"));
        return;
      }
      links.push({ iconUrl: icon.iconUrl, url: href, ...(icon.label.trim() ? { label: icon.label.trim() } : {}) });
    }

    const plainText = richHtmlToPlainText(textHtml);
    if (!plainText && !imageUrl && !videoUrl && links.length === 0) {
      setError(t("announcement.errorEmpty"));
      return;
    }

    // Only keep classes that still exist (one may have been deleted since
    // this announcement was first posted).
    const classIds =
      audience === "classes" ? selectedClassIds.filter((id) => classes.some((c) => c.id === id)) : [];
    if (audience === "classes" && classIds.length === 0) {
      setError(t("announcement.errorNoClasses"));
      return;
    }

    setSaving(true);
    setError("");
    try {
      await saveAnnouncement({
        id: announcement?.id,
        text: plainText,
        textHtml: sanitizeRichHtml(textHtml),
        imageUrl: imageUrl || undefined,
        videoUrl: videoUrl || undefined,
        links,
        classIds,
        authorId: user.uid,
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
    if (!announcement) return;
    setSaving(true);
    try {
      await deleteAnnouncement(announcement.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div>
        <label className="label-eyebrow block mb-1.5">{t("announcement.audienceLabel")}</label>
        <div className="space-y-2">
          <label className="flex items-start gap-2 text-sm text-navy cursor-pointer">
            <input
              type="radio"
              name="announcement-audience"
              checked={audience === "all"}
              onChange={() => setAudience("all")}
              className="mt-1 accent-gold"
            />
            <span>
              <span className="font-semibold">{t("announcement.audienceEveryone")}</span>
              <span className="block text-xs text-cream-600">{t("announcement.audienceEveryoneHint")}</span>
            </span>
          </label>
          <label
            className={`flex items-start gap-2 text-sm text-navy ${
              classes.length === 0 ? "opacity-50" : "cursor-pointer"
            }`}
          >
            <input
              type="radio"
              name="announcement-audience"
              checked={audience === "classes"}
              disabled={classes.length === 0}
              onChange={() => setAudience("classes")}
              className="mt-1 accent-gold"
            />
            <span>
              <span className="font-semibold">{t("announcement.audienceClasses")}</span>
              <span className="block text-xs text-cream-600">
                {classes.length === 0 ? t("announcement.noClassesYet") : t("announcement.audienceClassesHint")}
              </span>
            </span>
          </label>

          {audience === "classes" && classes.length > 0 && (
            <div className="ms-6 flex flex-wrap gap-2">
              {classes.map((c) => {
                const checked = selectedClassIds.includes(c.id);
                return (
                  <label
                    key={c.id}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold cursor-pointer transition-colors ${
                      checked
                        ? "border-navy bg-navy text-cream-100"
                        : "border-cream-400 bg-white text-navy hover:bg-cream-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleClass(c.id)}
                      className="h-4 w-4 accent-gold"
                    />
                    {c.name}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div>
        <label className="label-eyebrow block mb-1.5">{t("announcement.textLabel")}</label>
        <RichTextEditor
          value={textHtml}
          onChange={setTextHtml}
          placeholder={t("announcement.textPlaceholder")}
        />
      </div>

      <div>
        <label className="label-eyebrow block mb-1">{t("announcement.iconsLabel")}</label>
        <p className="text-xs text-cream-600 mb-2">{t("announcement.iconsHint")}</p>
        <div className="space-y-2">
          {icons.map((icon) => (
            <IconRow
              key={icon.key}
              draft={icon}
              onChange={(patch) => updateIcon(icon.key, patch)}
              onRemove={() => setIcons((prev) => prev.filter((i) => i.key !== icon.key))}
              onError={setError}
            />
          ))}
        </div>
        {icons.length < MAX_ANNOUNCEMENT_ICONS && (
          <button
            type="button"
            onClick={() => setIcons((prev) => [...prev, newIconDraft()])}
            className="btn-secondary py-1.5 px-3 text-sm mt-2"
          >
            <Plus size={16} />
            {t("announcement.addIcon")}
          </button>
        )}
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
          <button
            type="submit"
            disabled={saving || uploadingImage || uploadingVideo || uploadingIcon}
            className="btn-primary"
          >
            {saving ? t("common.loading") : t("common.save")}
          </button>
        </div>
      </div>
    </form>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  // The announcement open in the editor, or null when writing a new one.
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const celebratedRef = useRef(false);

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
    const unsubscribe = subscribeToAnnouncements(setAnnouncements, console.error);
    return unsubscribe;
  }, []);

  // Newest first; a teacher manages the announcements they posted.
  const myAnnouncements = useMemo(
    () => (user ? announcements.filter((a) => isAnnouncementOwnedBy(a, user.uid)) : []),
    [announcements, user]
  );

  function describeAudience(a: Announcement): string {
    if (!a.classIds || a.classIds.length === 0) return t("announcement.audienceEveryone");
    const names = a.classIds
      .map((id) => classes.find((c) => c.id === id)?.name)
      .filter((name): name is string => !!name);
    return names.length > 0 ? names.join(", ") : t("announcement.audienceUnknown");
  }

  function openEditor(target: Announcement | null) {
    setEditing(target);
    setEditorOpen(true);
  }

  // Class champions: recompute for every class the teacher owns each time
  // the dashboard loads (not just once per configured period — a teacher
  // who awards points mid-period expects the board to reflect that
  // immediately), then celebrate once per dashboard visit if any class has
  // a board to show. The board itself is displayed in the class header on
  // the Students tab, not here — this just keeps it warm and fires the
  // confetti. Only the teacher's client has read access to every student's
  // points in a class, so this is the one place this can run.
  useEffect(() => {
    const classIds = classes.map((c) => c.id);
    if (classIds.length === 0) return;
    const period =
      profile?.rankingPeriodStart !== undefined && profile?.rankingPeriodEnd !== undefined
        ? { start: profile.rankingPeriodStart, end: profile.rankingPeriodEnd }
        : getDefaultRankingPeriod();
    let cancelled = false;
    computeAndSaveRankingsForClasses(classIds, period, true)
      .then((results) => {
        if (cancelled) return;
        if (!celebratedRef.current && results.some((r) => (r.positions || []).length > 0)) {
          celebratedRef.current = true;
          triggerWeeklyChampionsCelebration();
        }
      })
      .catch((err) => console.error("Could not compute the champions boards", err));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes.map((c) => c.id).join(","), profile?.rankingPeriodStart, profile?.rankingPeriodEnd]);

  const totalStudents = classes.reduce(
    (sum, c) => sum + (studentCounts[c.id] || 0),
    0
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-navy">{t("dashboard.title")}</h1>

      <div className="space-y-4">
        <button
          onClick={() => openEditor(null)}
          className="card w-full p-5 flex items-center gap-3 text-cream-600 hover:text-navy hover:border-gold/40 border border-dashed border-cream-400 transition"
        >
          <Megaphone size={20} />
          <span className="text-sm font-semibold">{t("announcement.post")}</span>
        </button>

        {myAnnouncements.map((a) => (
          <div key={a.id} className="space-y-2">
            <AnnouncementCard announcement={a} audienceLabel={describeAudience(a)} />
            <button
              onClick={() => openEditor(a)}
              className="text-sm font-semibold text-gold hover:text-gold-700"
            >
              {t("announcement.edit")}
            </button>
          </div>
        ))}
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

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={t("announcement.title")}
        widthClassName="max-w-2xl"
      >
        <AnnouncementEditor
          announcement={editing}
          classes={classes}
          onClose={() => setEditorOpen(false)}
        />
      </Modal>
    </div>
  );
}
