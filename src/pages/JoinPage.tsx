import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { User } from "firebase/auth";
import { useAuth } from "../contexts/AuthContext";
import { getInvite } from "../lib/services/invitesService";
import {
  subscribeToStudents,
  createStudent,
  createStudentAccountMapping,
  updateStudent,
  findStudentByAuthUid,
} from "../lib/services/studentsService";
import { createParentProfile, getParentProfile } from "../lib/services/parentsService";
import type { InviteRecord, StudentRecord } from "../types";
import Spinner from "../components/common/Spinner";

type Stage = "loading" | "invalid" | "form" | "submitting" | "done";

// A Google redirect sign-in fully reloads the page, so which invite (and,
// for a parent, which child) was being joined has to be stashed somewhere
// that survives that round-trip.
const PENDING_JOIN_KEY = "lingotrace_pending_join";

interface PendingJoinData {
  token: string;
  childStudentId?: string;
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
  const { beginGoogleSignIn, completeGoogleSignIn, refreshPortalRole } = useAuth();

  const [stage, setStage] = useState<Stage>("loading");
  const [invite, setInvite] = useState<InviteRecord | null>(null);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [error, setError] = useState("");
  const [childStudentId, setChildStudentId] = useState("");

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
    if (!invite || invite.role !== "parent") return;
    const unsub = subscribeToStudents(invite.classId, setStudents);
    return unsub;
  }, [invite]);

  async function finalizeJoin(firebaseUser: User, pending: PendingJoinData) {
    if (!invite) return;

    // Guard against creating a duplicate record: if this Google account has
    // already joined a class before (as a student or a parent), don't
    // create a second one — just sign them into what they already have.
    // This also makes re-clicking an old invite link a safe no-op.
    const [existingParent, existingStudent] = await Promise.all([
      getParentProfile(firebaseUser.uid),
      findStudentByAuthUid(firebaseUser.uid),
    ]);
    if (existingParent || existingStudent) {
      clearPendingJoin();
      await refreshPortalRole();
      setStage("done");
      navigate(existingParent ? "/portal/parent" : "/portal/student", { replace: true });
      return;
    }

    if (invite.role === "student") {
      const newStudentId = await createStudent({
        name: firebaseUser.displayName || "Student",
        classId: invite.classId,
        photoURL: firebaseUser.photoURL || undefined,
        authUid: firebaseUser.uid,
      });
      await createStudentAccountMapping(firebaseUser.uid, newStudentId, invite.classId);
    } else {
      const studentId = pending.childStudentId;
      if (!studentId) {
        setError(t("join.errorPickChild"));
        setStage("form");
        return;
      }
      await createParentProfile({
        uid: firebaseUser.uid,
        email: firebaseUser.email || "",
        displayName: firebaseUser.displayName || "Parent",
        classId: invite.classId,
        studentId,
      });
      // The only place parent contact info gets captured now — needed for
      // the "send report" email feature.
      await updateStudent(studentId, {
        parentName: firebaseUser.displayName || "",
        parentEmail: firebaseUser.email || "",
      });
    }
    clearPendingJoin();
    await refreshPortalRole();
    setStage("done");
    navigate(invite.role === "student" ? "/portal/student" : "/portal/parent", {
      replace: true,
    });
  }

  // On mount, check whether we're landing back from the Google redirect.
  useEffect(() => {
    if (!invite || !token) return;
    completeGoogleSignIn()
      .then((firebaseUser) => {
        if (!firebaseUser) return;
        const pending = loadPendingJoin(token) || { token };
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
    if (!token) return;
    if (invite?.role === "parent" && !childStudentId) {
      setError(t("join.errorPickChild"));
      return;
    }
    setError("");
    setStage("submitting");
    try {
      savePendingJoin({ token, childStudentId: childStudentId || undefined });
      await beginGoogleSignIn();
      // page is navigating away to Google
    } catch {
      clearPendingJoin();
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
  const canContinue = !isParent || !!childStudentId;

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4 py-10">
      <div className="card w-full max-w-md p-8">
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

        {isParent && (
          <div className="mb-6">
            <label className="label-eyebrow block mb-1.5">{t("join.selectChild")}</label>
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
            <p className="text-xs text-cream-600 mt-1.5">{t("join.selectChildHint")}</p>
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogle}
          disabled={stage === "submitting" || !canContinue}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-cream-300 bg-white py-2.5 text-sm font-semibold text-navy hover:bg-cream-50 transition disabled:opacity-50"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18z" />
            <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.03l3-2.33z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
          </svg>
          {stage === "submitting" ? t("common.loading") : t("auth.continueWithGoogle")}
        </button>

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
