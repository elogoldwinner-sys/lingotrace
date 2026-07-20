import { useTranslation } from "react-i18next";
import { Megaphone } from "lucide-react";
import type { Announcement } from "../../types";
import { formatNoteDate } from "../../lib/timestamps";

export default function AnnouncementCard({ announcement }: { announcement: Announcement }) {
  const { t, i18n } = useTranslation();

  return (
    <div className="card p-6 border-l-4 border-l-gold">
      <div className="flex items-center gap-2 mb-3">
        <Megaphone size={18} className="text-gold" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">
          {t("announcement.title")}
        </h2>
      </div>

      {announcement.text && (
        <p className="text-navy whitespace-pre-wrap mb-3">{announcement.text}</p>
      )}

      {announcement.imageUrl && (
        <img
          src={announcement.imageUrl}
          alt=""
          className="w-full max-h-96 object-contain rounded-lg mb-3 bg-cream-100"
        />
      )}

      {announcement.videoUrl && (
        <video
          src={announcement.videoUrl}
          controls
          className="w-full max-h-96 rounded-lg mb-3 bg-navy"
        />
      )}

      <p className="text-xs text-cream-600">
        {announcement.postedByName}
        {announcement.updatedAt && ` · ${formatNoteDate(announcement.updatedAt, i18n.language)}`}
      </p>
    </div>
  );
}
