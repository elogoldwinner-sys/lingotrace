import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import {
  Trash2,
  Award,
  Send,
  Check,
  Plus,
  Upload,
  Download,
  RotateCcw,
  CheckSquare,
  Square,
  X,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { subscribeToClasses } from "../lib/services/classesService";
import {
  subscribeToStudents,
  deleteStudent,
  deleteManyStudents,
  createStudentManual,
  createStudentsBulk,
  updateStudent,
} from "../lib/services/studentsService";
import { awardPoints, subscribeToStudentPointsHistory } from "../lib/services/pointsService";
import { subscribeToStudentAttendance } from "../lib/services/attendanceService";
import { subscribeToStudentNotes, deleteNote } from "../lib/services/notesService";
import { subscribeToSessions } from "../lib/services/sessionsService";
import { sendPeriodReportToParent } from "../lib/services/reportService";
import { getBadgeDefinition } from "../lib/services/badgesService";
import { resetStudentData, resetClassData } from "../lib/services/resetService";
import { parseCsv, buildCsv, downloadTextFile } from "../lib/csv";
import { uploadToCloudinary } from "../lib/cloudinary";
import type {
  ClassRecord,
  StudentRecord,
  PointsReason,
  PointsTransaction,
  AttendanceRecord,
  AttendanceStatus,
  NoteRecord,
  SessionRecord,
} from "../types";
import Modal from "../components/common/Modal";
import EmptyState from "../components/common/EmptyState";
import Spinner from "../components/common/Spinner";
import ClassSelector from "../components/common/ClassSelector";

interface BulkRow {
  name: string;
  parentName?: string;
  parentEmail?: string;
  error?: string;
}

const POINTS_REASONS: PointsReason[] = [
  "participation",
  "homework",
  "behavior",
  "attendance",
  "assignment",
  "manual",
  "other",
];

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

  const [pointsModalStudent, setPointsModalStudent] = useState<StudentRecord | null>(null);
  const [pointsAmount, setPointsAmount] = useState(1);
  const [pointsReason, setPointsReason] = useState<PointsReason>("participation");

  // Performance detail panel
  const [detailStudent, setDetailStudent] = useState<StudentRecord | null>(null);
  const [detailPoints, setDetailPoints] = useState<PointsTransaction[]>([]);
  const [detailAttendance, setDetailAttendance] = useState<AttendanceRecord[]>([]);
  const [detailNotes, setDetailNotes] = useState<NoteRecord[]>([]);
  const [detailSessions, setDetailSessions] = useState<SessionRecord[]>([]);
  const [reportStart, setReportStart] = useState(daysAgoISO(30));
  const [reportEnd, setReportEnd] = useState(todayISO());
  const [sendingReport, setSendingReport] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [reportError, setReportError] = useState("");

  // Manual add-one-student
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addParentName, setAddParentName] = useState("");
  const [addParentEmail, setAddParentEmail] = useState("");
  const [addSubmitting, setAddSubmitting] = useState(false);

  // Bulk import via CSV
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkDone, setBulkDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Multi-select delete
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Reset (class-wide or single student)
  const [resettingClass, setResettingClass] = useState(false);
  const [resettingStudent, setResettingStudent] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  // Student photo (edited by teacher from the detail panel)
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const detailPhotoInputRef = useRef<HTMLInputElement>(null);

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
    const unsubSessions = subscribeToSessions(detailStudent.classId, setDetailSessions);
    return () => {
      unsubPoints();
      unsubAttendance();
      unsubNotes();
      unsubSessions();
    };
    // Only re-subscribe when the *identity* of the detail student changes,
    // not every time one of its fields (points, badgeIds, photoURL...)
    // changes underneath it — see the sync effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailStudent?.id]);

  // `detailStudent` starts as a snapshot of the row that was clicked, so
  // without this it never picks up later changes to that same student —
  // points/badges/photo awarded or reset elsewhere would update the live
  // `students` list but the open detail panel would keep showing stale
  // values (this is what made "Reset student" look like it didn't do
  // anything: the data really was cleared in Firestore, the modal just
  // never re-rendered with the new numbers). Keep it in sync with the
  // roster subscription instead.
  useEffect(() => {
    if (!detailStudent) return;
    const updated = students.find((s) => s.id === detailStudent.id);
    if (updated && updated !== detailStudent) {
      setDetailStudent(updated);
    }
  }, [students, detailStudent]);

  async function handleDelete(id: string) {
    if (!window.confirm(t("students.confirmDeleteOne"))) return;
    await deleteStudent(id);
  }

  function toggleSelectMode() {
    setSelectMode((prev) => !prev);
    setSelectedIds(new Set());
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(students.map((s) => s.id)));
  }

  async function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(t("students.confirmDeleteMany", { count: selectedIds.size }))) return;
    setBulkDeleting(true);
    try {
      await deleteManyStudents(Array.from(selectedIds));
      setSelectedIds(new Set());
      setSelectMode(false);
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleAddStudent(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClassId || !addName.trim()) return;
    setAddSubmitting(true);
    try {
      await createStudentManual({
        classId: selectedClassId,
        name: addName.trim(),
        parentName: addParentName.trim() || undefined,
        parentEmail: addParentEmail.trim() || undefined,
      });
      setAddName("");
      setAddParentName("");
      setAddParentEmail("");
      setAddModalOpen(false);
    } finally {
      setAddSubmitting(false);
    }
  }

  function handleDownloadTemplate() {
    const csv = buildCsv(
      ["name", "parentName", "parentEmail"],
      [
        ["Amina Al-Sayed", "Fatima Al-Sayed", "fatima@example.com"],
        ["Yusuf Al-Rashid", "", ""],
      ]
    );
    downloadTextFile("lingotrace-students-template.csv", csv);
  }

  function handleBulkFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBulkFileName(file.name);
    setBulkDone(false);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const parsed = parseCsv(text);
      const rows: BulkRow[] = parsed.map((row) => {
        const name = row["name"] || row["student name"] || row["student"] || "";
        if (!name) {
          return { name: "", error: t("students.bulkErrorMissingName") };
        }
        return {
          name,
          parentName: row["parentname"] || row["parent name"] || undefined,
          parentEmail: row["parentemail"] || row["parent email"] || undefined,
        };
      });
      setBulkRows(rows);
    };
    reader.readAsText(file);
  }

  async function handleBulkImport() {
    if (!selectedClassId) return;
    const validRows = bulkRows.filter((r) => r.name && !r.error);
    if (validRows.length === 0) return;
    setBulkSubmitting(true);
    try {
      await createStudentsBulk(
        selectedClassId,
        validRows.map((r) => ({ name: r.name, parentName: r.parentName, parentEmail: r.parentEmail }))
      );
      setBulkDone(true);
      setBulkRows([]);
      setBulkFileName("");
      // Briefly show the "Students added!" confirmation, then close on its own
      // so the teacher isn't required to click Cancel after a successful import.
      setTimeout(() => {
        setBulkModalOpen(false);
        setBulkDone(false);
      }, 1100);
    } finally {
      setBulkSubmitting(false);
    }
  }

  function closeBulkModal() {
    setBulkModalOpen(false);
    setBulkRows([]);
    setBulkFileName("");
    setBulkDone(false);
  }

  async function handleResetStudent() {
    if (!detailStudent) return;
    if (!window.confirm(t("students.confirmResetStudent", { name: detailStudent.name }))) return;
    setResettingStudent(true);
    setResetDone(false);
    try {
      await resetStudentData(detailStudent.id);
      setResetDone(true);
    } finally {
      setResettingStudent(false);
    }
  }

  async function handleResetClass() {
    if (!selectedClassId || students.length === 0) return;
    const className = classes.find((c) => c.id === selectedClassId)?.name || "";
    if (!window.confirm(t("students.confirmResetClass", { className }))) return;
    setResettingClass(true);
    try {
      await resetClassData(students.map((s) => s.id));
    } finally {
      setResettingClass(false);
    }
  }

  async function handleDetailPhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !detailStudent) return;
    setUploadingPhoto(true);
    try {
      const result = await uploadToCloudinary(file, "lingotrace/students");
      await updateStudent(detailStudent.id, { photoURL: result.secure_url });
    } finally {
      setUploadingPhoto(false);
    }
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
    setPointsAmount(1);
  }

  function openDetail(student: StudentRecord) {
    setReportSent(false);
    setReportError("");
    setResetDone(false);
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
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setAddModalOpen(true)} className="btn-primary text-sm py-2 px-3" disabled={!selectedClassId}>
            <Plus size={16} />
            {t("students.addStudent")}
          </button>
          <button
            onClick={() => setBulkModalOpen(true)}
            className="btn-secondary text-sm py-2 px-3"
            disabled={!selectedClassId}
          >
            <Upload size={16} />
            {t("students.bulkImport")}
          </button>
        </div>
      </div>

      <ClassSelector classes={classes} selectedClassId={selectedClassId} onSelect={setSelectedClassId} />

      {students.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cream-400/70 pb-3">
          <button
            onClick={toggleSelectMode}
            className="text-sm font-semibold text-navy hover:text-gold inline-flex items-center gap-1.5"
          >
            {selectMode ? <X size={16} /> : <CheckSquare size={16} />}
            {selectMode ? t("common.cancel") : t("students.selectStudents")}
          </button>

          {selectMode ? (
            <div className="flex items-center gap-3">
              <button onClick={selectAll} className="text-sm font-semibold text-gold hover:underline">
                {t("students.selectAll")}
              </button>
              <span className="text-sm text-cream-600">
                {t("students.selectedCount", { count: selectedIds.size })}
              </span>
              <button
                onClick={handleDeleteSelected}
                disabled={selectedIds.size === 0 || bulkDeleting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                <Trash2 size={14} />
                {bulkDeleting ? t("common.loading") : t("students.deleteSelected")}
              </button>
            </div>
          ) : (
            <button
              onClick={handleResetClass}
              disabled={resettingClass}
              className="text-sm font-semibold text-red-600 hover:text-red-700 inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <RotateCcw size={14} />
              {resettingClass ? t("common.loading") : t("students.resetClass")}
            </button>
          )}
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : students.length === 0 ? (
        <EmptyState message={t("students.noStudents")} icon="🧑‍🎓" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {students.map((s) => (
            <div
              key={s.id}
              onClick={() => (selectMode ? toggleSelected(s.id) : openDetail(s))}
              className={`card p-5 flex flex-col gap-3 cursor-pointer hover:shadow-md hover:border-gold/40 transition ${
                selectMode && selectedIds.has(s.id) ? "ring-2 ring-gold border-gold/40" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                {selectMode && (
                  <span className="text-navy">
                    {selectedIds.has(s.id) ? <CheckSquare size={20} /> : <Square size={20} />}
                  </span>
                )}
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
                {!selectMode && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(s.id);
                    }}
                    className="text-cream-600 hover:text-red-600 p-1"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="pill bg-navy text-cream-200">
                  {s.points} {t("students.points")}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPointsAmount(1);
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
            <div className="flex flex-wrap gap-2">
              {POINTS_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setPointsReason(reason)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
                    pointsReason === reason
                      ? "border-gold bg-gold-50 text-gold"
                      : "border-cream-300 text-cream-600 hover:border-gold/50 hover:text-gold"
                  }`}
                >
                  {t(`points.reasons.${reason}`)}
                </button>
              ))}
            </div>
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
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  ref={detailPhotoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleDetailPhotoSelected}
                />
                <button
                  type="button"
                  onClick={() => detailPhotoInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  title={t("auth.changePhoto")}
                  className="relative h-12 w-12 shrink-0 rounded-full group disabled:opacity-60"
                >
                  {detailStudent.photoURL ? (
                    <img
                      src={detailStudent.photoURL}
                      alt={detailStudent.name}
                      className="h-12 w-12 rounded-full object-cover border border-gold/40"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-navy text-cream-100 flex items-center justify-center font-semibold">
                      {detailStudent.name[0]?.toUpperCase()}
                    </div>
                  )}
                  <div
                    className={`absolute inset-0 flex items-center justify-center rounded-full bg-navy/60 transition-opacity ${
                      uploadingPhoto ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    {uploadingPhoto ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-cream-200 border-t-transparent" />
                    ) : (
                      <Upload size={14} className="text-cream-100" />
                    )}
                  </div>
                </button>
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
              <button
                onClick={handleResetStudent}
                disabled={resettingStudent}
                className="text-sm font-semibold text-red-600 hover:text-red-700 inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <RotateCcw size={14} />
                {resettingStudent
                  ? t("common.loading")
                  : resetDone
                    ? t("students.resetDone")
                    : t("students.resetStudent")}
              </button>
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
                  {detailNotes.map((n) => {
                    const noteSession = n.sessionId
                      ? detailSessions.find((se) => se.id === n.sessionId)
                      : undefined;
                    return (
                      <div
                        key={n.id}
                        className={`rounded-lg border px-3 py-2 text-sm flex items-start justify-between gap-2 ${
                          n.sentiment === "positive"
                            ? "border-green-300 bg-green-50 text-green-800"
                            : "border-red-300 bg-red-50 text-red-800"
                        }`}
                      >
                        <div className="min-w-0">
                          {noteSession && (
                            <p className="text-xs font-semibold opacity-70 mb-0.5">{noteSession.title}</p>
                          )}
                          {n.content}
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteNote(n.id)}
                          title={t("common.delete")}
                          className="shrink-0 opacity-60 hover:opacity-100 hover:text-red-700 p-0.5"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
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

      <Modal open={addModalOpen} onClose={() => setAddModalOpen(false)} title={t("students.addStudent")}>
        <form onSubmit={handleAddStudent} className="space-y-4">
          <div>
            <label className="label-eyebrow block mb-1.5">{t("students.name")}</label>
            <input
              required
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="label-eyebrow block mb-1.5">{t("students.parentName")}</label>
            <input
              value={addParentName}
              onChange={(e) => setAddParentName(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="label-eyebrow block mb-1.5">{t("students.parentEmail")}</label>
            <input
              type="email"
              value={addParentEmail}
              onChange={(e) => setAddParentEmail(e.target.value)}
              className="input-field"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAddModalOpen(false)} className="btn-secondary">
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={addSubmitting} className="btn-primary">
              {addSubmitting ? t("common.loading") : t("common.save")}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={bulkModalOpen} onClose={closeBulkModal} title={t("students.bulkImport")} widthClassName="max-w-xl">
        <div className="space-y-4">
          <p className="text-sm text-cream-600">{t("students.bulkImportHint")}</p>

          <button type="button" onClick={handleDownloadTemplate} className="btn-secondary text-sm py-2 px-3">
            <Download size={14} />
            {t("students.downloadTemplate")}
          </button>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleBulkFileSelected}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn-secondary text-sm py-2 px-3"
            >
              <Upload size={14} />
              {bulkFileName || t("students.chooseFile")}
            </button>
          </div>

          {bulkRows.length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded-lg border border-cream-400 divide-y divide-cream-400">
              {bulkRows.map((row, idx) => (
                <div key={idx} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className={row.error ? "text-red-600" : "text-navy"}>
                    {row.name || t("students.bulkErrorMissingName")}
                  </span>
                  {row.error && <span className="text-xs text-red-600">{row.error}</span>}
                </div>
              ))}
            </div>
          )}

          {bulkDone && <p className="text-sm text-green-700">{t("students.bulkImportDone")}</p>}

          {!bulkDone && (
            <div className="flex justify-end gap-2">
              <button type="button" onClick={closeBulkModal} className="btn-secondary">
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={handleBulkImport}
                disabled={bulkSubmitting || bulkRows.filter((r) => r.name && !r.error).length === 0}
                className="btn-primary"
              >
                {bulkSubmitting ? t("common.loading") : t("students.importCount", {
                  count: bulkRows.filter((r) => r.name && !r.error).length,
                })}
              </button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
