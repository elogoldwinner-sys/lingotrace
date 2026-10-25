import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AvatarGender } from "../../lib/avatars";

/**
 * Lets the teacher choose which avatar collection a class uses (Boys / Girls /
 * Mixed). Either used as a plain selector (`onChange`), or with a Save button
 * (`onSave`) for the one-time choice on a class that has none yet.
 */
export default function ClassTypeCard({
  value,
  onChange,
  onSave,
  saving,
}: {
  value?: AvatarGender | "";
  onChange?: (g: AvatarGender) => void;
  onSave?: (g: AvatarGender) => void | Promise<void>;
  saving?: boolean;
}) {
  const { t } = useTranslation();
  const [local, setLocal] = useState<AvatarGender | "">(value ?? "");
  const current = onChange ? value ?? "" : local;
  const options: { id: AvatarGender; emoji: string; count: number }[] = [
    { id: "boys", emoji: "👦", count: 32 },
    { id: "girls", emoji: "👧", count: 32 },
    { id: "mixed", emoji: "🧒", count: 64 },
  ];

  function pick(g: AvatarGender) {
    if (onChange) onChange(g);
    else setLocal(g);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => pick(o.id)}
            className={`rounded-xl border-2 px-2 py-3 text-center transition ${
              current === o.id ? "border-gold bg-gold-50" : "border-cream-400 bg-white hover:border-gold/60"
            }`}
          >
            <span className="block text-2xl">{o.emoji}</span>
            <span className="block text-sm font-bold text-navy">{t(`avatars.type.${o.id}`)}</span>
            <span className="block text-[11px] text-cream-600">{t("avatars.pictures", { count: o.count })}</span>
          </button>
        ))}
      </div>
      {onSave && (
        <>
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{t("avatars.typeOnce")}</p>
          <button
            type="button"
            disabled={!current || saving}
            onClick={() => {
              if (!current) return;
              if (window.confirm(t("avatars.confirmType", { type: t(`avatars.type.${current}`) }))) onSave(current);
            }}
            className="btn-primary w-full justify-center disabled:opacity-50"
          >
            {t("avatars.saveType")}
          </button>
        </>
      )}
    </div>
  );
}
