import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Building2 } from "lucide-react";
import { useAuth, isDismissedPopupError } from "../../contexts/AuthContext";
import { useSchool } from "../../contexts/SchoolContext";
import Logo from "../../components/common/Logo";
import Spinner from "../../components/common/Spinner";

/**
 * Sign-in for the school portal. Staff (department head, counselor, supervisor,
 * coordinator) just sign in with the Gmail their principal added. A principal
 * who has no school yet sees a button to create it.
 */
export default function SchoolLoginPage() {
  const { t } = useTranslation();
  const { user, beginGoogleSignIn, signOut, loading: authLoading } = useAuth();
  const { staff, loading } = useSchool();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authLoading && !loading && user && staff) navigate("/school", { replace: true });
  }, [authLoading, loading, user, staff, navigate]);

  async function signIn() {
    setError("");
    setBusy(true);
    try {
      await beginGoogleSignIn();
    } catch (err) {
      if (!isDismissedPopupError(err)) setError(t("auth.googleError"));
    } finally {
      setBusy(false);
    }
  }

  const waiting = authLoading || (!!user && loading);

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-cream-600 hover:text-navy">
          <ArrowLeft size={16} />
          {t("common.backToHome")}
        </Link>
        <div className="card p-8 text-center">
          <div className="mb-6 flex items-center justify-center gap-2">
            <Logo size={28} />
            <span className="font-serif text-xl font-semibold text-navy">{t("app.name")}</span>
          </div>
          <h1 className="mb-1 flex items-center justify-center gap-2 text-2xl font-semibold text-navy">
            <Building2 size={22} />
            {t("sp.loginTitle", "School portal")}
          </h1>
          <p className="mb-6 text-sm text-cream-600">
            {t("sp.loginSub", "For school principals, department heads, counselors, supervisors and coordinators.")}
          </p>

          {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          {waiting ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : !user ? (
            <button
              type="button"
              onClick={signIn}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-cream-300 bg-white py-2.5 text-sm font-semibold text-navy transition hover:bg-cream-50 disabled:opacity-60"
            >
              {busy ? t("common.loading") : t("auth.continueWithGoogle")}
            </button>
          ) : (
            <div className="space-y-3 text-start">
              <p className="rounded-lg border border-cream-400 bg-cream-100 px-3 py-2 text-sm text-navy">
                {t("sp.noAccess", { defaultValue: "{{email}} has no school-portal access yet.", email: user.email || "" })}
              </p>
              <p className="text-sm text-cream-600">
                {t("sp.noAccessHelp", "Staff: ask your principal (or department head) to add this Gmail address. Principal: create your school below.")}
              </p>
              <Link to="/school/setup" className="btn-primary flex w-full justify-center">
                {t("sp.createSchool", "I'm a school principal — create my school")}
              </Link>
              <button type="button" onClick={() => signOut()} className="btn-secondary w-full">
                {t("sp.useAnother", "Use another Google account")}
              </button>
            </div>
          )}

          <p className="mt-6 text-center text-sm text-cream-600">
            {t("sp.areYouTeacher", "Are you a teacher?")}{" "}
            <Link to="/login" className="font-semibold text-gold hover:underline">
              {t("sp.teacherLogin", "Teacher login")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
