import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { User } from "firebase/auth";
import { useAuth } from "../contexts/AuthContext";
import { getInvite } from "../lib/services/invitesService";
import { subscribeToStudents, createStudent, createStudentAccountMapping, updateStudent } from "../lib/services/studentsService";
import { createParentProfile } from "../lib/services/parentsService";
import type { InviteRecord, StudentRecord } from "../types";
import Spinner from "../components/common/Spinner";

type Stage = "loading" | "invalid" | "form" | "submitting" | "done";

// A Google redirect sign-in fully reloads the page, so the form fields have
// to be stashed somewhere that survives that round-trip.
const PENDING_JOIN_KEY = "lingotrace_pending_join";

interface PendingJoinData {
  token: string;
  firstName: string;
  middleName: string;
  lastName: string;
  childStudentId: string;
  parentName: string;
  email: string;
}

function savePendingJoin(data: PendingJoinData) {
  sessionStorage.setItem(PENDING_JOIN_KEY, JSON.stringify(data));
}

function loadPendingJoin(token: string): PendingJoinData | null {
  const raw = sessionStorage.getItem(PENDING_JOIN_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingJoinData;
    return parsed.token === token ? parsed : null;
  } catch {
    return null;
  }
}

function clearPendingJoin() {
  sessionStorage.removeItem(PENDING_JOIN_KEY);
}

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    signInWithGooglePopupOnly,
    signInWithGoogleRedirect,
    getGoogleRedirectResult,
    registerWithEmail,
    refreshPortalRole,
  } = useAuth();

  const [stage, setStage] = useState<Stage>("loading");
  const [invite, setInvite] = useState<InviteRecord | null>(null);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [error, setError] = useState("");

  // Student-only fields — every student joining is a brand-new self-registration
  // (there's no teacher-maintained roster to match against anymore).
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");

  // Parent-only fields
  const [childStudentId, setChildStudentId] = useState("");
  const [parentName, setParentName] = useState("");

  // Email/password fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (!token) return;
    getInvite(token)
      .then((data) => {
        if (!data) {
          setStage("invalid");
          return;
        }
        setInvite(data);
        setStage("form");
      })
      .catch(() => setStage("invalid"));
  }, [token]);

  useEffect(() => {
    if (!invite) return;
    const unsub = subscribeToStudents(invite.classId, setStudents);
    return unsub;
  }, [invite]);

  function validateSelection(): string | null {
    if (!invite) return t("join.errorGeneric");
    if (invite.role === "student") {
      if (!firstName.trim()) return t("join.errorEnterFirstName");
      if (!lastName.trim()) return t("join.errorEnterLastName");
    } else {
      if (!childStudentId) return t("join.errorPickChild");
      if (!parentName.trim()) return t("join.errorEnterYourName");
    }
    return null;
  }

  async function finalizeJoin(firebaseUser: User, overrides?: PendingJoinData) {
    if (!invite) return;
    const fields = {
      firstName: overrides?.firstName ?? firstName,
      middleName: overrides?.middleName ?? middleName,
      lastName: overrides?.lastName ?? lastName,
      childStudentId: overrides?.childStudentId ?? childStudentId,
      parentName: overrides?.parentName ?? parentName,
      email: overrides?.email ?? email,
    };
    if (invite.role === "student") {
      const newStudentId = await createStudent({
        firstName: fields.firstName.trim(),
        middleName: fields.middleName.trim() || undefined,
        lastName: fields.lastName.trim(),
        classId: invite.classId,
        authUid: firebaseUser.uid,
      });
      await createStudentAccountMapping(firebaseUser.uid, newStudentId, invite.classId);
    } else {
      await createParentProfile({
        uid: firebaseUser.uid,
        email: firebaseUser.email || fields.email,
        displayName: fields.parentName.trim(),
        classId: invite.classId,
        studentId: fields.childStudentId,
      });
      // Students no longer get parent contact info from a teacher-entered
      // form — this is the only place it's captured, so the "send report"
      // email feature has somewhere to send to.
      await updateStudent(fields.childStudentId, {
        parentName: fields.parentName.trim(),
        parentEmail: firebaseUser.email || fields.email,
      });
    }
    clearPendingJoin();
    await refreshPortalRole();
    setStage("done");
    navigate(invite.role === "student" ? "/portal/student" : "/portal/parent", {
      replace: true,
    });
  }

  // On mount, check whether we're landing back from a Google redirect
  // sign-in (the popup fallback for mobile/tablet browsers that block or
  // silently kill popups). If so, restore the form fields that were stashed
  // right before the redirect and finish the join automatically.
  useEffect(() => {
    if (!invite || !token) return;
    getGoogleRedirectResult()
      .then((firebaseUser) => {
        if (!firebaseUser) return;
        const pending = loadPendingJoin(token);
        if (!pending) return;
        setFirstName(pending.firstName);
        setMiddleName(pending.middleName);
        setLastName(pending.lastName);
        setChildStudentId(pending.childStudentId);
        setParentName(pending.parentName);
        setEmail(pending.email);
        setStage("submitting");
        return finalizeJoin(firebaseUser, pending);
      })
      .catch(() => {
        setError(t("join.errorAuth"));
        setStage("form");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invite, token]);

  async function handleGoogle() {
    const validationError = validateSelection();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setStage("submitting");
    try {
      const firebaseUser = await signInWithGooglePopupOnly();
      await finalizeJoin(firebaseUser);
    } catch (err) {
      const code = (err as { code?: string })?.code || "";
      const isPopupIssue =
        code === "auth/popup-blocked" ||
        code === "auth/cancelled-popup-request" ||
        code === "auth/popup-closed-by-user" ||
        code === "auth/operation-not-supported-in-this-environment";

      if (isPopupIssue && token) {
        // Popup didn't work (common on mobile/tablet browsers) — fall back
        // to a full-page redirect instead. Save the form fields first since
        // the page is about to fully reload.
        savePendingJoin({
          token,
          firstName,
          middleName,
          lastName,
          childStudentId,
          parentName,
          email,
        });
        await signInWithGoogleRedirect();
        return; // page is navigating away
      }

      setError(t("join.errorAuth"));
      setStage("form");
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validateSelection();
    if (validationError) {
      setError(validationError);
      return;
    }
    if (password !== confirmPassword) {
      setError(t("join.errorPasswordMismatch"));
      return;
    }
    setError("");
    setStage("submitting");
    try {
      const firebaseUser = await registerWithEmail(email, password);
      await finalizeJoin(firebaseUser);
    } catch {
      setError(t("join.errorAuth"));
      setStage("form");
    }
  }

  if (stage === "loading") {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (stage === "invalid") {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-4">
        <div className="card w-full max-w-md p-8 text-center">
          <p className="text-2xl mb-2">🍪</p>
          <h1 className="text-xl font-semibold text-navy mb-2">{t("join.invalidTitle")}</h1>
          <p className="text-sm text-cream-600">{t("join.invalidBody")}</p>
        </div>
      </div>
    );
  }

  const isParent = invite?.role === "parent";

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4 py-10">
      <div className="card w-full max-w-lg p-8">
        <div className="flex items-center gap-2 mb-6">
          <span className="text-2xl">🍪</span>
          <span className="font-serif text-xl font-semibold text-navy">{t("app.name")}</span>
        </div>

        <h1 className="text-2xl font-semibold text-navy mb-1">
          {isParent ? t("join.parentTitle") : t("join.studentTitle")}
        </h1>
        <p className="text-sm text-cream-600 mb-6">
          {t("join.subTitle", { className: invite?.className })}
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Identity fields */}
        <div className="mb-6 space-y-3">
          {isParent ? (
            <>
              <label className="label-eyebrow">{t("join.selectChild")}</label>
              <select
                value={childStudentId}
                onChange={(e) => setChildStudentId(e.target.value)}
                className="input-field"
              >
                <option value="">{t("join.selectChildPlaceholder")}</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <label className="label-eyebrow">{t("join.yourName")}</label>
              <input
                type="text"
                value={parentName}
                onChange={(e) => setParentName(e.target.value)}
                className="input-field"
                placeholder={t("join.yourNamePlaceholder")}
              />
            </>
          ) : (
            <>
              <label className="label-eyebrow">{t("join.studentNameFields")}</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="input-field"
                  placeholder={t("join.firstNamePlaceholder")}
                />
                <input
                  type="text"
                  value={middleName}
                  onChange={(e) => setMiddleName(e.target.value)}
                  className="input-field"
                  placeholder={t("join.middleNamePlaceholder")}
                />
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="input-field"
                  placeholder={t("join.lastNamePlaceholder")}
                />
              </div>
            </>
          )}
        </div>

        {/* Auth options */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={stage === "submitting"}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-cream-300 bg-white py-2.5 text-sm font-semibold text-navy hover:bg-cream-50 transition disabled:opacity-60 mb-4"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18z" />
            <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.03l3-2.33z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
          </svg>
          {t("auth.continueWithGoogle")}
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="h-px flex-1 bg-cream-400" />
          <span className="text-xs text-cream-600">{t("join.orEmail")}</span>
          <div className="h-px flex-1 bg-cream-400" />
        </div>

        <form onSubmit={handleEmailSubmit} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-field"
            placeholder={t("join.emailPlaceholder")}
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field"
            placeholder={t("join.passwordPlaceholder")}
          />
          <input
            type="password"
            required
            minLength={6}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="input-field"
            placeholder={t("join.confirmPasswordPlaceholder")}
          />
          <button type="submit" disabled={stage === "submitting"} className="btn-primary w-full">
            {stage === "submitting" ? t("common.loading") : t("join.createAccount")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-cream-600">
          {t("join.haveAccountAlready")}{" "}
          <Link to="/portal-login" className="font-semibold text-gold hover:underline">
            {t("auth.portalLoginLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}
