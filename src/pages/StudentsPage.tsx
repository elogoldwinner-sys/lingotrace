import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Plus, Trash2, Award } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { subscribeToClasses } from "../lib/services/classesService";
import {
  subscribeToStudents,
  createStudent,
  deleteStudent,
} from "../lib/services/studentsService";
import { awardPoints } from "../lib/services/pointsService";
import { uploadToCloudinary } from "../lib/cloudinary";
import { getBadgeDefinition } from "../lib/services/badgesService";
import type { ClassRecord, StudentRecord, PointsReason } from "../types";
import Modal from "../components/common/Modal";
import EmptyState from "../components/common/EmptyState";
import Spinner from "../components/common/Spinner";

export default function StudentsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const preselectedClassId = searchParams.get("classId") || "";

  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [selectedClassId, setSelectedClassId] = useState(preselectedClassId);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [pointsModalStudent, setPointsModalStudent] = useState<StudentRecord | null>(null);
  const [pointsAmount, setPointsAmount] = useState(5);
  const [pointsReason, setPointsReason] = useState<PointsReason>("participation");

  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToClasses(user.uid, (data) => {
      setClasses(data);
      if (!selectedClassId && data.length > 0) {
        setSelectedClassId(data[0].id);
      }
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!selectedClassId) {
      setStudents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = subscribeToStudents(
      selectedClassId,
      (data) => {
        setStudents(data);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsubscribe;
  }, [selectedClassId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClassId) return;
    setSubmitting(true);
    try {
      let photoURL: string | undefined;
      if (photoFile) {
        const result = await uploadToCloudinary(photoFile, "lingotrace/students");
        photoURL = result.secure_url;
      }
      await createStudent({
        name,
        classId: selectedClassId,
        parentName,
        parentEmail,
        photoURL,
      });
      setName("");
      setParentName("");
      setParentEmail("");
      setPhotoFile(null);
      setModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteStudent(id);
  }

  async function handleAwardPoints(e: React.FormEvent) {
    e.preventDefault();
    if (!pointsModalStudent || !user) return;
    await awardPoints({
      studentId: pointsModalStudent.id,
      classId: pointsModalStudent.classId,
      amount: pointsAmount,
      reason: pointsReason,
      awardedBy: user.uid,
    });
    setPointsModalStudent(null);
    setPointsAmount(5);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-semibold text-navy">{t("students.title")}</h1>
        <div className="flex items-center gap-3">
          <select
            value={selectedClassId}
            onChange={(e) => {
              setSelectedClassId(e.target.value);
              setStudents([]);
            }}
            className="input-field w-auto"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setModalOpen(true)}
            className="btn-primary"
            disabled={!selectedClassId}
          >
            <Plus size={16} />
            {t("students.newStudent")}
          </button>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : students.length === 0 ? (
        <EmptyState message={t("students.noStudents")} icon="🧑‍🎓" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {students.map((s) => (
            <div key={s.id} className="card p-5 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                {s.photoURL ? (
                  <img
                    src={s.photoURL}
                    alt={s.name}
                    className="h-12 w-12 rounded-full object-cover border border-gold/40"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-navy text-cream-100 flex items-center justify-center font-semibold">
                    {s.name[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1">
                  <p className="font-semibold text-navy">{s.name}</p>
                  {s.parentName && (
                    <p className="text-xs text-cream-600">{s.parentName}</p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(s.id)}
                  className="text-cream-600 hover:text-red-600 p-1"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="pill bg-navy text-cream-200">
                  {s.points} {t("students.points")}
                </span>
                <button
                  onClick={() => setPointsModalStudent(s)}
                  className="btn-gold py-1.5 px-3 text-xs"
                >
                  <Award size={14} />
                  {t("points.award")}
                </button>
              </div>

              {s.badgeIds?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {s.badgeIds.map((badgeId) => {
                    const badge = getBadgeDefinition(badgeId);
                    if (!badge) return null;
                    return (
                      <span
                        key={badgeId}
                        title={badge.description}
                        className="pill bg-gold-50 text-gold"
                      >
                        {badge.icon} {badge.name}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t("students.newStudent")}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="label-eyebrow block mb-1.5">{t("students.name")}</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="label-eyebrow block mb-1.5">{t("students.parentName")}</label>
            <input value={parentName} onChange={(e) => setParentName(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="label-eyebrow block mb-1.5">{t("students.parentEmail")}</label>
            <input
              type="email"
              value={parentEmail}
              onChange={(e) => setParentEmail(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="label-eyebrow block mb-1.5">Photo</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
              className="input-field"
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

      <Modal
        open={!!pointsModalStudent}
        onClose={() => setPointsModalStudent(null)}
        title={`${t("points.award")} — ${pointsModalStudent?.name || ""}`}
      >
        <form onSubmit={handleAwardPoints} className="space-y-4">
          <div>
            <label className="label-eyebrow block mb-1.5">{t("points.amount")}</label>
            <input
              type="number"
              value={pointsAmount}
              onChange={(e) => setPointsAmount(Number(e.target.value))}
              className="input-field"
            />
          </div>
          <div>
            <label className="label-eyebrow block mb-1.5">{t("points.reason")}</label>
            <select
              value={pointsReason}
              onChange={(e) => setPointsReason(e.target.value as PointsReason)}
              className="input-field"
            >
              <option value="participation">Participation</option>
              <option value="homework">Homework</option>
              <option value="behavior">Behavior</option>
              <option value="attendance">Attendance</option>
              <option value="assignment">Assignment</option>
              <option value="manual">Manual</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPointsModalStudent(null)} className="btn-secondary">
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn-primary">
              {t("common.save")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
