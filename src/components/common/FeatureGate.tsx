import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import { useFeature, useFeatureAudience } from "../../contexts/SchoolContext";
import { FEATURE_BY_KEY, type FeatureKey } from "../../lib/features";

/** Small lock pill. For a principal it links to the support page with the ticket pre-filled; for anyone else it's a hint. */
export function LockBadge({ feature, className = "", compact = false }: { feature: FeatureKey; className?: string; compact?: boolean }) {
  const { t } = useTranslation();
  const { isPrincipal } = useFeatureAudience();
  const name = t(`feat.${feature}.label`, FEATURE_BY_KEY[feature].label);
  const hint = isPrincipal
    ? t("feat.lockedPrincipal", "Not included in your school's plan. Tap to ask the administrator to enable it.")
    : t("feat.lockedTeacher", "Not enabled for your school. Ask your principal to request it.");
  const body = (
    <>
      <Lock size={compact ? 11 : 12} aria-hidden="true" />
      {!compact && <span>{isPrincipal ? t("feat.requestAccess", "Request access") : t("feat.locked", "Locked")}</span>}
    </>
  );
  const cls = `inline-flex items-center gap-1 rounded-full border border-gold/50 bg-gold-50 px-2 py-0.5 text-[11px] font-bold text-gold shadow-sm ${className}`;
  if (isPrincipal) {
    return (
      <Link to={`/school/support?feature=${feature}`} title={`${name} — ${hint}`} aria-label={`${name} — ${hint}`} className={`${cls} hover:bg-gold hover:text-white`}>
        {body}
      </Link>
    );
  }
  return (
    <span title={`${name} — ${hint}`} className={cls}>
      {body}
    </span>
  );
}

/**
 * Wraps a piece of UI that depends on an admin-controlled feature. When the feature is off the content is still
 * visible but faded, greyed out and completely inert (no clicks, no focus), with a lock badge in the corner.
 */
export default function FeatureGate({
  feature,
  children,
  as = "div",
  className = "",
  badge = true,
  notice = false,
}: {
  feature: FeatureKey;
  children: ReactNode;
  /** "span" for inline things such as a button inside a row of buttons. */
  as?: "div" | "span";
  className?: string;
  badge?: boolean;
  /** Also print a short "not included in your plan" line above the faded content (for whole pages). */
  notice?: boolean;
}) {
  const { t } = useTranslation();
  const { isPrincipal } = useFeatureAudience();
  const enabled = useFeature(feature);
  if (enabled) return <>{children}</>;
  const Tag = as;
  return (
    <Tag className={`relative ${as === "span" ? "inline-flex" : "block"} ${className}`}>
      {notice && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-gold/40 bg-gold-50 px-3 py-2 text-sm font-semibold text-navy">
          <Lock size={15} className="shrink-0 text-gold" />
          {isPrincipal
            ? t("feat.noticePrincipal", "This feature isn't included in your school's plan. Use “Request access” to ask the administrator.")
            : t("feat.noticeTeacher", "This feature isn't enabled for your school. Ask your principal to request it.")}
        </p>
      )}
      <Tag inert aria-disabled="true" className={`${as === "span" ? "inline-flex" : "block"} pointer-events-none select-none opacity-45 grayscale`}>
        {children}
      </Tag>
      {badge && <LockBadge feature={feature} className="absolute -top-2 end-1 z-10" compact={as === "span"} />}
    </Tag>
  );
}
