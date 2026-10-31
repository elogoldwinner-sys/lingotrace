import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useAuth, isDismissedPopupError } from "../../contexts/AuthContext";
import { isAdminEmail } from "../../lib/admin";
import Logo from "../../components/common/Logo";
import Spinner from "../../components/common/Spinner";

/** Sign-in for the platform admin. Any other Google account is told it has no access. */
export default function AdminLoginPage() {
  const { t } = useTranslation();
  const { user, beginGoogleSignIn, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isAdmin = isAdminEmail(user?.email);

  useEffect(() => {
    if (!loading && user && isAdmin) navigate("/admin", { replace: true });
  }, [loading, user, isAdmin, navigate]);

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
            <ShieldCheck size={22} />
            {t("adm.loginTitle", "Admin portal")}
          </h1>
          <p className="mb-6 text-sm text-cream-600">{t("adm.loginSub", "Manage schools, plans and support tickets.")}</p>

          {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          {loading ? (
            <Spinner />
          ) : !user ? (
            <button
              type="button"
              onClick={signIn}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-cream-300 bg-white py-2.5 text-sm font-semibold text-navy transition hover:bg-cream-50 disabled:opacity-60"
            >
              {busy ? t("common.loading") : t("auth.continueWithGoogle")}
            </button>
          ) : !isAdmin ? (
            <div className="space-y-3 text-start">
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {t("adm.notAdmin", "This Google account is not authorised for the admin portal.")} <span dir="ltr">({user.email})</span>
              </p>
              <button type="button" onClick={() => signOut()} className="btn-secondary w-full">
                {t("sp.useAnother", "Use another Google account")}
              </button>
            </div>
          ) : (
            <Spinner />
          )}
        </div>
      </div>
    </div>
  );
}
