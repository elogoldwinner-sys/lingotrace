import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { useAuth, isDismissedPopupError } from "../contexts/AuthContext";
import { getParentProfile } from "../lib/services/parentsService";
import { findStudentByAuthUid } from "../lib/services/studentsService";

/**
 * Separate login surface for students and parents. Deliberately never
 * touches the teachers collection — it only authenticates via Google and
 * then routes based on whichever portal role (student/parent) the account
 * already resolves to. Creating a *new* student/parent account only ever
 * happens through a teacher's class-specific `/join/:token` invite link,
 * never here.
 */
export default function PortalLoginPage() {
  const { t } = useTranslation();
  const { beginGoogleSignIn, refreshPortalRole } = useAuth();
  const navigate = useNavigate();

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function routeByRole(uid: string) {
    await refreshPortalRole();

    const parent = await getParentProfile(uid);
    if (parent) {
      navigate("/portal/parent", { replace: true });
      return;
    }
    const student = await findStudentByAuthUid(uid);
    if (student) {
      navigate("/portal/student", { replace: true });
      return;
    }
    setError(t("auth.notRegisteredError"));
  }

  async function handleGoogleSignIn() {
    setError("");
    setSubmitting(true);
    try {
      const firebaseUser = await beginGoogleSignIn();
      await routeByRole(firebaseUser.uid);
    } catch (err) {
      if (!isDismissedPopupError(err)) {
        setError(t("auth.googleError"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4">
      <div className="card w-full max-w-md p-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-6">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Lingo Bite" className="h-7 w-7 object-contain" />
          <span className="font-serif text-xl font-semibold text-navy">{t("app.name")}</span>
        </div>
        <h1 className="text-2xl font-semibold text-navy mb-1">{t("auth.portalWelcomeBack")}</h1>
        <p className="text-sm text-cream-600 mb-6">{t("auth.portalWelcomeBackSub")}</p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={submitting}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-cream-300 bg-white py-2.5 text-sm font-semibold text-navy hover:bg-cream-50 transition disabled:opacity-60"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18z" />
            <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.03l3-2.33z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
          </svg>
          {submitting ? t("common.loading") : t("auth.continueWithGoogle")}
        </button>

        <p className="mt-6 text-center text-sm text-cream-600">{t("auth.noPortalAccount")}</p>
        <p className="mt-2 text-center text-sm text-cream-600">
          {t("auth.areYouATeacher")}{" "}
          <Link to="/login" className="font-semibold text-gold hover:underline">
            {t("auth.teacherLoginLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}
