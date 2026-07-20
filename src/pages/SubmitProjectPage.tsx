import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LogOut, Check } from "lucide-react";
import { useAuth, isDismissedPopupError } from "../contexts/AuthContext";
import { getProjectOnce, isDeadlinePassed } from "../lib/services/projectsService";
import { subscribeToSubmission, submitProject } from "../lib/services/submissionsService";
import type { ProjectRecord, SubmissionRecord } from "../types";
import Spinner from "../components/common/Spinner";
import Logo from "../components/common/Logo";

type Stage = "loading" | "invalid";

export default function SubmitProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { t } = useTranslation();
  const { user, role, portalStudent, loading: authLoading, beginGoogleSignIn, refreshPortalRole, signOut } =
    useAuth();

  const [stage, setStage] = useState<Stage>("loading");
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [submission, setSubmission] = useState<SubmissionRecord | null>(null);

  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState("");

  const [link, setLink] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    getProjectOnce(projectId)
      .then((data) => {
        if (!data) {
          setStage("invalid");
          return;
        }
        setProject(data);
      })
      .catch(() => setStage("invalid"));
  }, [projectId]);

  const isMatchingStudent =
    role === "student" && !!portalStudent && !!project && portalStudent.classId === project.classId;

  useEffect(() => {
    if (!isMatchingStudent || !project || !portalStudent) return;
    const unsubscribe = subscribeToSubmission(project.id, portalStudent.id, (data) => {
      setSubmission(data);
      if (data) {
        setLink(data.link);
        setNote(data.note || "");
      }
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMatchingStudent, project?.id, portalStudent?.id]);

  async function handleGoogle() {
    setAuthError("");
    setSigningIn(true);
    try {
      await beginGoogleSignIn();
      await refreshPortalRole();
    } catch (err) {
      if (!isDismissedPopupError(err)) {
        setAuthError(t("auth.googleError"));
      }
    } finally {
      setSigningIn(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!project || !portalStudent) return;
    setSubmitting(true);
    try {
      await submitProject({
        projectId: project.id,
        classId: project.classId,
        studentId: portalStudent.id,
        link,
        note,
      });
      setJustSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (stage === "invalid") {
    return (
      <CenteredCard>
        <Logo size={32} className="mb-2" />
        <h1 className="text-xl font-semibold text-navy mb-2">{t("submit.invalidTitle")}</h1>
        <p className="text-sm text-cream-600">{t("submit.invalidBody")}</p>
      </CenteredCard>
    );
  }

  if (authLoading || !project) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return (
      <CenteredCard>
        <h1 className="text-2xl font-semibold text-navy mb-1">{t("submit.signInTitle")}</h1>
        <p className="text-sm text-cream-600 mb-6">{t("submit.signInSub", { className: project.title })}</p>
        {authError && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {authError}
          </div>
        )}
        <GoogleButton
          onClick={handleGoogle}
          disabled={signingIn}
          label={t("auth.continueWithGoogle")}
          loadingLabel={t("common.loading")}
        />
      </CenteredCard>
    );
  }

  if (role !== "student" || !portalStudent) {
    return (
      <CenteredCard>
        <h1 className="text-xl font-semibold text-navy mb-2">{t("submit.notStudentError")}</h1>
        <button
          onClick={() => signOut()}
          className="mt-4 flex items-center justify-center gap-1.5 mx-auto text-sm font-semibold text-navy/70 hover:text-navy"
        >
          <LogOut size={14} />
          {t("nav.signOut")}
        </button>
      </CenteredCard>
    );
  }

  if (!isMatchingStudent) {
    return (
      <CenteredCard>
        <h1 className="text-xl font-semibold text-navy mb-2">{t("submit.wrongClassError")}</h1>
        <button
          onClick={() => signOut()}
          className="mt-4 flex items-center justify-center gap-1.5 mx-auto text-sm font-semibold text-navy/70 hover:text-navy"
        >
          <LogOut size={14} />
          {t("nav.signOut")}
        </button>
      </CenteredCard>
    );
  }

  const deadlinePassed = isDeadlinePassed(project.deadline);
  const alreadyGraded = typeof submission?.awardedMark === "number";
  const locked = deadlinePassed || alreadyGraded;

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4 py-10">
      <div className="card w-full max-w-lg p-8">
        <p className="label-eyebrow mb-1">{portalStudent.name}</p>
        <h1 className="text-2xl font-semibold text-navy mb-1">{project.title}</h1>
        {project.description && <p className="text-sm text-cream-600 mb-3">{project.description}</p>}
        <p className="text-xs font-semibold text-cream-600 mb-6">
          {t("projects.deadlineLabel", { date: project.deadline })}
        </p>

        {alreadyGraded && (
          <div className="mb-4 rounded-lg bg-gold-50 border border-gold/30 px-3 py-2 text-sm text-navy">
            {t("submit.alreadyGraded")}
            <br />
            <span className="font-semibold">{t("submit.yourMark", { mark: submission?.awardedMark })}</span>
            {submission?.teacherNote && (
              <>
                <p className="label-eyebrow mt-2 mb-0.5">{t("submit.teacherFeedback")}</p>
                <p>{submission.teacherNote}</p>
              </>
            )}
          </div>
        )}
        {!alreadyGraded && deadlinePassed && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {t("submit.deadlinePassedBody")}
          </div>
        )}
        {justSubmitted && !locked && (
          <div className="mb-4 flex items-center gap-1.5 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
            <Check size={14} />
            {t("submit.submittedBody")}
          </div>
        )}

        {locked ? (
          submission && (
            <div className="rounded-lg border border-cream-400 px-3 py-2 text-sm text-navy break-all">
              <p className="label-eyebrow mb-1">{t("projects.submissionLinkLabel")}</p>
              {submission.link}
              {submission.note && (
                <>
                  <p className="label-eyebrow mt-3 mb-1">{t("projects.studentNote")}</p>
                  {submission.note}
                </>
              )}
            </div>
          )
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label-eyebrow block mb-1.5">{t("submit.linkLabel")}</label>
              <input
                required
                type="url"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder={t("submit.linkPlaceholder")}
                className="input-field"
              />
            </div>
            <div>
              <label className="label-eyebrow block mb-1.5">{t("submit.noteLabel")}</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("submit.notePlaceholder")}
                className="input-field"
                rows={3}
              />
            </div>
            <button type="submit" disabled={submitting} className="btn-primary w-full justify-center">
              {submission ? t("submit.updateButton") : t("submit.submitButton")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4">
      <div className="card w-full max-w-md p-8 text-center">{children}</div>
    </div>
  );
}

function GoogleButton({
  onClick,
  disabled,
  label,
  loadingLabel,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  loadingLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-center gap-2 rounded-lg border border-cream-300 bg-white py-2.5 text-sm font-semibold text-navy hover:bg-cream-50 transition disabled:opacity-50"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
        <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z" />
        <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18z" />
        <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.03l3-2.33z" />
        <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
      </svg>
      {disabled ? loadingLabel : label}
    </button>
  );
}
