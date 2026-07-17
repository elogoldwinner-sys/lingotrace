import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Plus, Trash2, Award, Send, Check } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { subscribeToClasses } from "../lib/services/classesService";
import {
  subscribeToStudents,
  createStudent,
  deleteStudent,
} from "../lib/services/studentsService";
import { awardPoints, subscribeToStudentPointsHistory } from "../lib/services/pointsService";
import { subscribeToStudentAttendance } from "../lib/services/attendanceService";
import { subscribeToStudentNotes } from "../lib/services/notesService";
import { sendPeriodReportToParent } from "../lib/services/reportService";
import { uploadToCloudinary } from "../lib/cloudinary";
import { getBadgeDefinition } from "../lib/services/badgesService";
import type {
  ClassRecord,
  StudentRecord,
  PointsReason,
  PointsTransaction,
  AttendanceRecord,
  AttendanceStatus,
  NoteRecord,
} from "../types";
import Modal from "../components/common/Modal";
import EmptyState from "../components/common/EmptyState";
import Spinner from "../components/common/Spinner";
import ClassSelector from "../components/common/ClassSelector";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

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

  // Performance detail panel
  const [detailStudent, setDetailStudent] = useState<StudentRecord | null>(null);
  const [detailPoints, setDetailPoints] = useState<PointsTransaction[]>([]);
  const [detailAttendance, setDetailAttendance] = useState<AttendanceRecord[]>([]);
  const [detailNotes, setDetailNotes] = useState<NoteRecord[]>([]);
  const [reportStart, setReportStart] = useState(daysAgoISO(30));
  const [reportEnd, setReportEnd] = useState(todayISO());
  const [sendingReport, setSendingReport] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [reportError, setReportError] = useState("");

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

  useEffect(() => {
    if (!detailStudent) return;
    const unsubPoints = subscribeToStudentPointsHistory(detailStudent.id, setDetailPoints);
    const unsubAttendance = subscribeToStudentAttendance(detailStudent.id, setDetailAttendance);
    const unsubNotes = subscribeToStudentNotes(detailStudent.id, setDetailNotes);
    return () => {
      unsubPoints();
      unsubAttendance();
      unsubNotes();
    };
  }, [detailStudent]);

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

  function openDetail(student: StudentRecord) {
    setReportSent(false);
    setReportError("");
    setDetailStudent(student);
  }

  async function handleSendReport() {
    if (!detailStudent) return;
    const className = classes.find((c) => c.id === selectedClassId)?.name || "";
    setSendingReport(true);
    setReportError("");
    setReportSent(false);
    try {
      await sendPeriodReportToParent({
        studentId: detailStudent.id,
        className,
        startDate: reportStart,
        endDate: reportEnd,
      });
      setReportSent(true);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : t("attendance.sendError"));
    } finally {
      setSendingReport(false);
    }
  }

  const attendanceCounts = detailAttendance.reduce(
    (acc, r) => {
      acc[r.status] += 1;
      return acc;
    },
    { present: 0, absent: 0, late: 0, excused: 0 } as Record<AttendanceStatus, number>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-semibold text-navy">{t("students.title")}</h1>
        <button
          onClick={() => setModalOpen(true)}
          className="btn-primary"
          disabled={!selectedClassId}
        >
          <Plus size={16} />
          {t("students.newStudent")}
        </button>
      </div>

      <ClassSelector classes={classes} selectedClassId={selectedClassId} onSelect={setSelectedClassId} />

      {loading ? (
        <Spinner />
      ) : students.length === 0 ? (
        <EmptyState message={t("students.noStudents")} icon="🧑‍🎓" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {students.map((s) => (
            <div
              key={s.id}
              onClick={() => openDetail(s)}
              className="card p-5 flex flex-col gap-3 cursor-pointer hover:shadow-md hover:border-gold/40 transition"
            >
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
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(s.id);
                  }}
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
                  onClick={(e) => {
                    e.stopPropagation();
                    setPointsAmount(5);
                    setPointsReason("participation");
                    setPointsModalStudent(s);
                  }}
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

      <Modal
        open={!!detailStudent}
        onClose={() => setDetailStudent(null)}
        title={detailStudent?.name || ""}
        widthClassName="max-w-2xl"
      >
        {detailStudent && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <span className="pill bg-navy text-cream-200 text-base">
                {detailStudent.points} {t("students.points")}
              </span>
              {detailStudent.badgeIds.map((badgeId) => {
                const badge = getBadgeDefinition(badgeId);
                if (!badge) return null;
                return (
                  <span key={badgeId} title={badge.description} className="pill bg-gold-50 text-gold">
                    {badge.icon} {badge.name}
                  </span>
                );
              })}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-navy mb-2">{t("attendance.title")}</h3>
              <div className="flex gap-2 text-xs">
                <span className="pill border bg-green-100 text-green-700 border-green-300">
                  {t("attendance.present")}: {attendanceCounts.present}
                </span>
                <span className="pill border bg-gold-100 text-gold-700 border-gold-300">
                  {t("attendance.late")}: {attendanceCounts.late}
                </span>
                <span className="pill border bg-red-100 text-red-700 border-red-300">
                  {t("attendance.absent")}: {attendanceCounts.absent}
                </span>
                <span className="pill border bg-navy-100 text-navy border-navy-200">
                  {t("attendance.excused")}: {attendanceCounts.excused}
                </span>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-navy mb-2">{t("points.award")}</h3>
              {detailPoints.length === 0 ? (
                <p className="text-sm text-cream-600">{t("portal.noPointsYet")}</p>
              ) : (
                <div className="divide-y divide-cream-400 max-h-40 overflow-y-auto">
                  {detailPoints.slice(0, 15).map((txn) => (
                    <div key={txn.id} className="flex items-center justify-between py-2 text-sm">
                      <span className="text-navy">{t(`points.reasons.${txn.reason}`)}</span>
                      <span className={txn.amount >= 0 ? "text-green-700 font-semibold" : "text-red-700 font-semibold"}>
                        {txn.amount >= 0 ? "+" : ""}
                        {txn.amount}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-navy mb-2">{t("notes.title")}</h3>
              {detailNotes.length === 0 ? (
                <p className="text-sm text-cream-600">{t("notes.noneYet")}</p>
              ) : (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {detailNotes.map((n) => (
                    <div
                      key={n.id}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        n.sentiment === "positive"
                          ? "border-green-300 bg-green-50 text-green-800"
                          : "border-red-300 bg-red-50 text-red-800"
                      }`}
                    >
                      {n.content}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-cream-400 pt-4">
              <h3 className="text-sm font-semibold text-navy mb-2">{t("attendance.sendReport")}</h3>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="label-eyebrow block mb-1 text-[10px]">{t("sessions.startDate")}</label>
                  <input
                    type="date"
                    value={reportStart}
                    onChange={(e) => setReportStart(e.target.value)}
                    className="input-field w-auto"
                  />
                </div>
                <div>
                  <label className="label-eyebrow block mb-1 text-[10px]">{t("sessions.endDate")}</label>
                  <input
                    type="date"
                    value={reportEnd}
                    onChange={(e) => setReportEnd(e.target.value)}
                    className="input-field w-auto"
                  />
                </div>
                <button
                  onClick={handleSendReport}
                  disabled={sendingReport || !detailStudent.parentEmail}
                  className="btn-primary py-2 px-4 text-sm disabled:opacity-50"
                >
                  {reportSent ? <Check size={16} /> : <Send size={16} />}
                  {sendingReport
                    ? t("common.loading")
                    : reportSent
                      ? t("attendance.sent")
                      : t("attendance.sendReport")}
                </button>
              </div>
              {!detailStudent.parentEmail && (
                <p className="text-xs text-cream-600 mt-2">{t("attendance.noParentEmail")}</p>
              )}
              {reportError && <p className="text-xs text-red-600 mt-2">{reportError}</p>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
