import { useTranslation } from "react-i18next";
import { Megaphone, Users } from "lucide-react";
import type { Announcement } from "../../types";
import { formatNoteDate } from "../../lib/timestamps";
import { normalizeAnnouncementUrl } from "../../lib/services/announcementsService";

interface AnnouncementCardProps {
  announcement: Announcement;
  /** Who this announcement is for (e.g. "Everyone" or "5A, 5B"). Shown to the teacher who posted it; students and parents don't need it. */
  audienceLabel?: string;
}

export default function AnnouncementCard({ announcement, audienceLabel }: AnnouncementCardProps) {
  const { t, i18n } = useTranslation();

  // Re-validated on every render, not just at save time: a link is only ever
  // rendered as a clickable <a> if it's an http(s)/mailto/tel URL.
  const links = (announcement.links || [])
    .map((link) => ({ ...link, href: normalizeAnnouncementUrl(link.url) }))
    .filter((link): link is typeof link & { href: string } => !!link.href && !!link.iconUrl);

  return (
    <div className="card p-6 border-l-4 border-l-gold">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Megaphone size={18} className="text-gold" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">
            {t("announcement.title")}
          </h2>
        </div>
        {audienceLabel && (
          <span className="pill border text-xs bg-white text-cream-600 border-cream-400 inline-flex items-center gap-1">
            <Users size={12} />
            {audienceLabel}
          </span>
        )}
      </div>

      {announcement.text && (
        <p className="text-navy whitespace-pre-wrap mb-3">{announcement.text}</p>
      )}

      {links.length > 0 && (
        <div className="flex flex-wrap gap-4 mb-3">
          {links.map((link, index) => (
            <a
              key={`${link.href}-${index}`}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              title={link.label || link.href}
              aria-label={link.label || link.href}
              className="group flex w-20 flex-col items-center gap-1.5 text-center"
            >
              <img
                src={link.iconUrl}
                alt=""
                className="h-14 w-14 rounded-xl border border-cream-400 bg-white object-contain p-1 transition group-hover:border-gold group-hover:shadow-md group-hover:-translate-y-0.5"
              />
              {link.label && (
                <span className="text-[11px] font-medium leading-tight text-navy line-clamp-2 break-words">
                  {link.label}
                </span>
              )}
            </a>
          ))}
        </div>
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
