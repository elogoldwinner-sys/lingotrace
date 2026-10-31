import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { format } from "date-fns";
import { Mail, MessageCircle } from "lucide-react";
import Spinner from "../../components/common/Spinner";
import { useSchool } from "../../contexts/SchoolContext";
import { useAuth } from "../../contexts/AuthContext";
import { useSchoolData } from "../../components/school/SchoolDataContext";
import { addFeedbackLog, listFeedbackLog } from "../../lib/services/schoolService";
import { sendFeedbackEmail, whatsappFeedbackLink } from "../../lib/school/feedbackSend";
import type { ClassRecord, FeedbackLogEntry, StudentRecord } from "../../types";

type Target = "grade" | "class" | "students";
interface Recipient {
  key: string;
  name: string;
  email?: string;
  whatsapp?: string;
}

const chip = (active: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
    active ? "border-gold bg-gold text-white" : "border-cream-400 bg-white text-navy hover:border-gold/60"
  }`;

/** Feedback about a grade, a class, or one / several students — to their teachers or parents, by email or WhatsApp. */
export default function SchoolFeedbackPage() {
  const { t } = useTranslation();
  const { staff, school } = useSchool();
  const { user, profile } = useAuth();
  const { classes, teachers, loading, getStudents, audit } = useSchoolData();
  const [tab, setTab] = useState<"send" | "log">("send");
  const [target, setTarget] = useState<Target>("class");
  const [grade, setGrade] = useState<number | null>(null);
  const [sectionKey, setSectionKey] = useState("");
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [pickedStudents, setPickedStudents] = useState<Set<string>>(new Set());
  const [audience, setAudience] = useState<"teachers" | "parents">("teachers");
  const [channel, setChannel] = useState<"email" | "whatsapp">("email");
  const [message, setMessage] = useState("");
  const [includeLog, setIncludeLog] = useState(true);
  const [parentRecipients, setParentRecipients] = useState<Recipient[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; links: Recipient[] } | null>(null);
  const [error, setError] = useState("");
  const [log, setLog] = useState<FeedbackLogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(false);

  const grades = useMemo(() => Array.from(new Set(classes.map((c) => c.grade).filter((g): g is number => g != null))).sort((a, b) => a - b), [classes]);
  const sectionKeys = useMemo(() => Array.from(new Set(classes.map((c) => c.classKey || "").filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [classes]);

  useEffect(() => {
    if (grade == null && grades.length) setGrade(grades[0]);
    if (!sectionKey && sectionKeys.length) setSectionKey(sectionKeys[0]);
    if (!classId && classes.length) setClassId(classes[0].id);
  }, [grades, sectionKeys, classes, grade, sectionKey, classId]);

  useEffect(() => {
    if (target !== "students" || !classId) return;
    getStudents(classId).then((s) => {
      setStudents(s);
      setPickedStudents(new Set());
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, classId]);

  const involved: ClassRecord[] = useMemo(() => {
    if (target === "grade") return classes.filter((c) => c.grade === grade);
    if (target === "class") return classes.filter((c) => c.classKey === sectionKey);
    return classes.filter((c) => c.id === classId);
  }, [target, classes, grade, sectionKey, classId]);

  const targetLabel = useMemo(() => {
    if (target === "grade") return `${t("sp.grade", "Grade")} ${grade}`;
    if (target === "class") return `${t("reports.class")} ${sectionKey}`;
    const c = classes.find((x) => x.id === classId);
    const names = students.filter((s) => pickedStudents.has(s.id)).map((s) => s.name);
    return `${names.length > 2 ? `${names.slice(0, 2).join("، ")} +${names.length - 2}` : names.join("، ")} (${c?.classKey || c?.name || ""} · ${c?.subject || ""})`;
  }, [target, grade, sectionKey, classId, classes, students, pickedStudents, t]);

  const teacherRecipients: Recipient[] = useMemo(() => {
    const out = new Map<string, Recipient>();
    for (const c of involved) {
      const m = teachers.find((x) => x.uid === c.teacherId);
      const key = m?.uid || c.teacherEmail || c.id;
      if (out.has(key)) continue;
      out.set(key, { key, name: m?.name || c.teacherEmail || c.ownerName || "—", email: m?.email || c.teacherEmail, whatsapp: m?.whatsapp });
    }
    return Array.from(out.values());
  }, [involved, teachers]);

  // Parents' emails come from the student records of the involved classes.
  useEffect(() => {
    if (audience !== "parents" || target === "grade") {
      setParentRecipients([]);
      return;
    }
    let cancelled = false;
    Promise.all(involved.map((c) => getStudents(c.id))).then((lists) => {
      if (cancelled) return;
      const out = new Map<string, Recipient>();
      lists.flat().forEach((s) => {
        if (target === "students" && !pickedStudents.has(s.id)) return;
        const mail = s.parentEmail?.trim().toLowerCase();
        if (mail && !out.has(mail)) out.set(mail, { key: mail, name: s.parentName || s.name, email: mail });
      });
      setParentRecipients(Array.from(out.values()));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience, target, involved.map((c) => c.id).join(","), pickedStudents]);

  useEffect(() => {
    if (tab !== "log" || !school || !user || !staff) return;
    setLogLoading(true);
    listFeedbackLog(school.id, staff.role === "principal" ? undefined : user.uid)
      .then(setLog)
      .catch(() => {})
      .finally(() => setLogLoading(false));
  }, [tab, school, user, staff]);

  if (!staff || staff.role === "counselor" || !school || !user) return <Navigate to="/school" replace />;
  if (loading) return <Spinner />;

  const recipients = audience === "teachers" ? teacherRecipients : parentRecipients;
  const usable = channel === "email" ? recipients.filter((r) => r.email) : recipients.filter((r) => r.whatsapp);
  const senderName = profile?.displayName || user.displayName || staff.displayName || user.email || "";
  const senderTitle = staff.jobTitle || t(`sp.role.${staff.role}`, staff.role);
  const canSend = !busy && message.trim().length > 0 && usable.length > 0 && (target !== "students" || pickedStudents.size > 0);

  const fullText = () =>
    `${t("sp.fbHeader", { defaultValue: "Feedback from {{name}} ({{title}}) — {{school}}", name: senderName, title: senderTitle, school: school.name })}\n${t("sp.fbAbout", "About")}: ${targetLabel}\n\n${message.trim()}`;

  async function send() {
    if (!school || !staff || !user) return;
    setBusy(true);
    setError("");
    setResult(null);
    let sent = 0;
    let failed = 0;
    let links: Recipient[] = [];
    try {
      if (channel === "email") {
        for (const r of usable) {
          try {
            await sendFeedbackEmail({
              to_email: r.email!,
              to_name: r.name,
              from_name: senderName,
              from_title: senderTitle,
              school_name: school.name,
              about: targetLabel,
              message: message.trim(),
            });
            sent++;
          } catch (err) {
            console.error("Feedback email failed", err);
            failed++;
          }
        }
      } else {
        links = usable;
        sent = usable.length;
      }
      if (sent > 0) {
        audit("feedback_sent", `${targetLabel} → ${audience === "teachers" ? t("sp.toTeachers", "teachers") : t("sp.toParents", "parents")} (${channel})`);
        if (includeLog) {
          await addFeedbackLog(school.id, {
            authorUid: user.uid,
            authorName: senderName,
            authorRole: staff.role,
            channel,
            targetLabel,
            recipientType: audience,
            recipients: usable.map((r) => r.name),
            message: message.trim(),
          }).catch((err) => console.error("Feedback log failed", err));
        }
      }
      setResult({ sent, failed, links });
      if (failed === 0 && channel === "email") setMessage("");
    } finally {
      setBusy(false);
    }
  }

  const toggleStudent = (id: string) =>
    setPickedStudents((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-navy">{t("sp.feedbackTitle", "Feedback")}</h1>
      <div className="flex gap-2">
        <button className={chip(tab === "send")} onClick={() => setTab("send")}>{t("sp.sendFeedback", "Send feedback")}</button>
        <button className={chip(tab === "log")} onClick={() => setTab("log")}>{staff.role === "principal" ? t("sp.feedbackLog", "Feedback log") : t("sp.myFeedbackLog", "My sent feedback")}</button>
      </div>

      {tab === "send" ? (
        <div className="card space-y-4 p-4">
          <div>
            <label className="label-eyebrow mb-1.5 block">{t("sp.feedbackAbout", "Feedback about")}</label>
            <div className="flex flex-wrap gap-2">
              {(["grade", "class", "students"] as Target[]).map((x) => (
                <button key={x} className={chip(target === x)} onClick={() => { setTarget(x); if (x === "grade") setAudience("teachers"); }}>
                  {t(`sp.target.${x}`, x === "grade" ? "A grade" : x === "class" ? "A class" : "Student(s)")}
                </button>
              ))}
            </div>
          </div>

          {target === "grade" && (
            <div className="flex flex-wrap gap-2">
              {grades.map((g) => (
                <button key={g} className={chip(grade === g)} onClick={() => setGrade(g)}>{t("sp.gradeN", { defaultValue: "Grade {{n}}", n: g })}</button>
              ))}
            </div>
          )}
          {target === "class" && (
            <div className="flex flex-wrap gap-2">
              {sectionKeys.map((k) => (
                <button key={k} className={chip(sectionKey === k)} onClick={() => setSectionKey(k)}>{k}</button>
              ))}
            </div>
          )}
          {target === "students" && (
            <div className="space-y-2">
              <select className="input-field w-full" value={classId} onChange={(e) => setClassId(e.target.value)}>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{`${c.classKey || c.name} · ${c.subject || "—"}`}</option>
                ))}
              </select>
              <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                {students.map((s) => (
                  <button key={s.id} className={chip(pickedStudents.has(s.id))} onClick={() => toggleStudent(s.id)}>{s.name}</button>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label-eyebrow mb-1.5 block">{t("sp.sendTo", "Send to")}</label>
              <div className="flex flex-wrap gap-2">
                <button className={chip(audience === "teachers")} onClick={() => setAudience("teachers")}>{t("sp.toTeachers", "Teachers")}</button>
                {target !== "grade" && <button className={chip(audience === "parents")} onClick={() => { setAudience("parents"); setChannel("email"); }}>{t("sp.toParents", "Parents")}</button>}
              </div>
            </div>
            <div>
              <label className="label-eyebrow mb-1.5 block">{t("sp.channel", "Send by")}</label>
              <div className="flex flex-wrap gap-2">
                <button className={chip(channel === "email")} onClick={() => setChannel("email")}><Mail size={13} className="me-1 inline" />Email</button>
                {audience === "teachers" && <button className={chip(channel === "whatsapp")} onClick={() => setChannel("whatsapp")}><MessageCircle size={13} className="me-1 inline" />WhatsApp</button>}
              </div>
            </div>
          </div>

          <p className="text-xs text-cream-600">
            {t("sp.recipientsCount", { defaultValue: "{{n}} recipient(s): {{names}}", n: usable.length, names: usable.map((r) => r.name).join("، ") || "—" })}
            {recipients.length > usable.length && ` · ${t("sp.missingContact", { defaultValue: "{{n}} without a {{what}}", n: recipients.length - usable.length, what: channel === "email" ? "email" : "WhatsApp number" })}`}
          </p>

          <div>
            <label className="label-eyebrow mb-1.5 block">{t("sp.message", "Message")}</label>
            <textarea className="input-field" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>

          <label className="flex items-center gap-2 text-sm font-semibold text-navy">
            <input type="checkbox" checked={includeLog} onChange={(e) => setIncludeLog(e.target.checked)} />
            {t("sp.recordInLog", "Record in the feedback log (the school principal can view it)")}
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {result && (
            <div className="space-y-2 rounded-lg border border-cream-400 bg-cream-100 p-3 text-sm">
              <p className="font-semibold text-navy">
                {channel === "email"
                  ? t("sp.emailResult", { defaultValue: "Sent: {{sent}} · Failed: {{failed}}", sent: result.sent, failed: result.failed })
                  : t("sp.whatsappReady", "Open each chat and press Send in WhatsApp:")}
              </p>
              {result.links.map((r) => (
                <a key={r.key} href={whatsappFeedbackLink(r.whatsapp!, fullText())} target="_blank" rel="noreferrer" className="btn-secondary inline-flex text-xs">
                  <MessageCircle size={14} />
                  {r.name}
                </a>
              ))}
            </div>
          )}
          <div className="flex justify-end">
            <button className="btn-primary disabled:opacity-50" disabled={!canSend} onClick={send}>
              {channel === "email" ? t("sp.sendEmail", "Send email") : t("sp.prepareWhatsapp", "Prepare WhatsApp messages")}
            </button>
          </div>
        </div>
      ) : logLoading ? (
        <Spinner />
      ) : log.length === 0 ? (
        <div className="card p-6 text-center text-sm text-cream-600">{t("sp.noFeedbackLog", "No feedback recorded yet.")}</div>
      ) : (
        <div className="space-y-2">
          {log.map((l) => (
            <div key={l.id} className="card p-4">
              <p className="text-xs text-cream-600">
                {l.createdAt ? format(new Date(l.createdAt), "yyyy-MM-dd HH:mm") : ""} · {l.authorName} ({t(`sp.role.${l.authorRole}`, l.authorRole)}) · {l.channel === "email" ? "Email" : "WhatsApp"}
              </p>
              <p className="mt-1 font-semibold text-navy">{l.targetLabel}</p>
              <p className="text-xs text-cream-600">→ {l.recipients.join("، ")}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-navy">{l.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
