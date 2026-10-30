import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Mars, Venus } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import type { TeacherGender } from "../../types";

/**
 * Shown once to a teacher whose profile has no gender yet — i.e. the very
 * first time they sign in, whether they signed up themselves or were added
 * by another teacher (both end up in the same teacher login flow). The
 * choice drives the honorific (Mr. / Ms.) and the dashboard illustration,
 * and can be changed later in Teacher preferences.
 *
 * It has no close button on purpose: it disappears the moment a choice is
 * made. If saving fails, AuthContext rolls the profile back, so the prompt
 * simply comes back with an error message and the teacher can try again.
 */
export default function GenderPromptModal() {
  const { t } = useTranslation();
  const { profile, updateTeacherGender } = useAuth();
  const [error, setError] = useState(false);

  if (!profile || profile.role !== "teacher" || profile.gender) return null;

  function choose(gender: TeacherGender) {
    setError(false);
    updateTeacherGender(gender).catch((err) => {
      console.error("Could not save the teacher gender", err);
      setError(true);
    });
  }

  const options = [
    { gender: "male" as const, Icon: Mars, label: t("dashboard.genderMale") },
    { gender: "female" as const, Icon: Venus, label: t("dashboard.genderFemale") },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-navy/50 px-3 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gender-prompt-title"
        className="card w-full max-w-md p-6 text-center sm:p-8"
      >
        <h2 id="gender-prompt-title" className="font-serif text-xl font-semibold text-navy sm:text-2xl">
          {t("preferences.genderPromptTitle")}
        </h2>
        <p className="mt-2 text-sm text-cream-600">{t("preferences.genderPromptHint")}</p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          {options.map(({ gender, Icon, label }) => (
            <button
              key={gender}
              type="button"
              onClick={() => choose(gender)}
              className="flex flex-col items-center gap-2 rounded-2xl border-2 border-cream-300 bg-cream-100/60 px-4 py-5 text-base font-semibold text-navy transition hover:border-gold hover:bg-gold-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              <Icon size={28} />
              {label}
            </button>
          ))}
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{t("preferences.saveError")}</p>}
        <p className="mt-4 text-xs text-cream-600">{t("preferences.genderPromptLater")}</p>
      </div>
    </div>,
    document.body
  );
}
