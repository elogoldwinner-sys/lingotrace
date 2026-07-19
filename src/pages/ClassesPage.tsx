import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Plus, Trash2, Link2, Check } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import {
  subscribeToClasses,
  createClass,
  deleteClass,
} from "../lib/services/classesService";
import { subscribeToStudentCounts } from "../lib/services/studentsService";
import { getOrCreateInvite, buildInviteUrl } from "../lib/services/invitesService";
import type { ClassRecord } from "../types";
import Modal from "../components/common/Modal";
import EmptyState from "../components/common/EmptyState";
import Spinner from "../components/common/Spinner";

export default function ClassesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copiedKey, setCopiedKey] = useState("");
  const [inviteError, setInviteError] = useState("");

  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToClasses(
      user.uid,
      (data) => {
        setClasses(data);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsubscribe;
  }, [user]);

  useEffect(() => {
    const classIds = classes.map((c) => c.id);
    const unsubscribe = subscribeToStudentCounts(classIds, setStudentCounts, console.error);
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes.map((c) => c.id).join(",")]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    try {
      await createClass({ name, description, teacherId: user.uid });
      setName("");
      setDescription("");
      setModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteClass(id);
  }

  async function handleCopyInvite(classItem: ClassRecord, role: "student" | "parent") {
    if (!user) return;
    setInviteError("");
    try {
      const invite = await getOrCreateInvite(classItem.id, classItem.name, role, user.uid);
      await navigator.clipboard.writeText(buildInviteUrl(invite.id));
      const key = `${classItem.id}-${role}`;
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(""), 2000);
    } catch {
      setInviteError(t("classes.inviteError"));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-navy">{t("classes.title")}</h1>
        <button onClick={() => setModalOpen(true)} className="btn-primary">
          <Plus size={16} />
          {t("classes.newClass")}
        </button>
      </div>

      {inviteError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {inviteError}
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : classes.length === 0 ? (
        <EmptyState message={t("classes.noClasses")} icon="📚" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.map((c) => (
            <div key={c.id} className="card p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div>
                  <Link
                    to={`/students?classId=${c.id}`}
                    className="font-semibold text-navy hover:text-gold"
                  >
                    {c.name}
                  </Link>
                  {c.description && (
                    <p className="text-sm text-cream-600 mt-1">{c.description}</p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(c.id)}
                  className="text-cream-600 hover:text-red-600 p-1"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <span className="pill bg-gold-50 text-gold w-fit">
                {studentCounts[c.id] || 0} {t("classes.students")}
              </span>
              <div className="flex gap-2 pt-1 border-t border-cream-400/70 mt-1">
                <button
                  onClick={() => handleCopyInvite(c, "student")}
                  className="btn-secondary flex-1 text-xs py-2"
                >
                  {copiedKey === `${c.id}-student` ? <Check size={14} /> : <Link2 size={14} />}
                  {copiedKey === `${c.id}-student` ? t("classes.copied") : t("classes.studentInvite")}
                </button>
                <button
                  onClick={() => handleCopyInvite(c, "parent")}
                  className="btn-secondary flex-1 text-xs py-2"
                >
                  {copiedKey === `${c.id}-parent` ? <Check size={14} /> : <Link2 size={14} />}
                  {copiedKey === `${c.id}-parent` ? t("classes.copied") : t("classes.parentInvite")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t("classes.newClass")}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="label-eyebrow block mb-1.5">{t("classes.className")}</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="label-eyebrow block mb-1.5">{t("classes.description")}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {t("common.save")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
