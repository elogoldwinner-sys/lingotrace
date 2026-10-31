import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import {
  Trash2,
  Award,
  Send,
  Check,
  Plus,
  Minus,
  Upload,
  Download,
  RotateCcw,
  CheckSquare,
  Square,
  X,
  UserX,
  Pencil,
  FileSpreadsheet,
  BarChart3,
  LineChart,
  Scale,
  Images,
} from "lucide-react";
import { deleteField } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import { useEffectiveSchoolLogo } from "../contexts/SchoolContext";
import { subscribeToClasses, updateClass } from "../lib/services/classesService";
import {
  subscribeToStudents,
  applySchoolLogoToStudents,
  applyAvatarGenderToStudents,
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
import { removeChildFromParent } from "../lib/services/parentsService";
import {
  computeAndSaveRankingForPeriod,
  getDefaultRankingPeriod,
} from "../lib/services/classRankingsService";
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
  ClassRanking,
  StudentGroup,
} from "../types";
import { STUDENT_GROUPS } from "../types";
import Modal from "../components/common/Modal";
import EmptyState from "../components/common/EmptyState";
import Spinner from "../components/common/Spinner";
import ClassSelector from "../components/common/ClassSelector";
import WeeklyChampions from "../components/common/WeeklyChampions";
import PointsReportModal from "../components/common/PointsReportModal";
import StudentAvatar, { rankOf } from "../components/avatars/StudentAvatar";
import AvatarPickerModal from "../components/avatars/AvatarPickerModal";
import ClassTypeCard from "../components/avatars/ClassTypeCard";
import { avatarPool, takenKeys } from "../lib/avatars";
import StudentReportModal from "../components/reports/StudentReportModal";
import ClassStatsModal, { type StatsTab } from "../components/reports/ClassStatsModal";
import CertificateModal from "../components/common/CertificateModal";
import RichText from "../components/common/RichText";
import { reasonsForAmount, POSITIVE_POINTS_REASONS } from "../lib/pointsReasons";
import { SOLID_TONES } from "../lib/uiColors";
import ReasonPicker, { useSaveCustomReason } from "../components/common/ReasonPicker";
import { studentDisplayName, primaryName } from "../lib/studentName";

interface BulkRow {
  name: string;
  nameAr?: string;
  nameEn?: string;
  parentName?: string;
  parentEmail?: string;
  error?: string;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function StudentsPage() {
  const { t, i18n } = useTranslation();
  const dn = (st: Parameters<typeof studentDisplayName>[0]) => studentDisplayName(st, i18n.language);
  const { user, profile, loading: authLoading } = useAuth();
  const { logo: schoolLogo } = useEffectiveSchoolLogo();
  const [searchParams] = useSearchParams();
  const preselectedClassId = searchParams.get("classId") || "";

  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [selectedClassId, setSelectedClassId] = useState(preselectedClassId);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [ranking, setRanking] = useState<ClassRanking | null>(null);
  const [rankingError, setRankingError] = useState(false);

  const [pointsModalStudent, setPointsModalStudent] = useState<StudentRecord | null>(null);
  const [pointsAmount, setPointsAmount] = useState(1);
  const [pointsReason, setPointsReason] = useState<PointsReason>(POSITIVE_POINTS_REASONS[0]);
  const [pointsNote, setPointsNote] = useState("");
  const [rememberReason, setRememberReason] = useState(true);
  const saveCustomReason = useSaveCustomReason();

  // Performance detail panel
  const [detailStudent, setDetailStudent] = useState<StudentRecord | null>(null);
  const [detailPoints, setDetailPoints] = useState<PointsTransaction[]>([]);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  // Printable student report (points gained/lost + graphs) and class statistics
  const healedLogoRef = useRef(new Set<string>());
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [savingType, setSavingType] = useState(false);
  const currentClass = classes.find((c) => c.id === selectedClassId);
  const classGender = currentClass?.avatarGender;
  const [studentReportTarget, setStudentReportTarget] = useState<StudentRecord | null>(null);
  const [classStatsOpen, setClassStatsOpen] = useState(false);
  const [classStatsTab, setClassStatsTab] = useState<StatsTab>("students");

  // Keep each student's copy of the class's avatar collection type up to date (the student portal needs it).
  useEffect(() => {
    if (!classGender || students.length === 0) return;
    if (students.every((s) => s.avatarGender === classGender)) return;
    applyAvatarGenderToStudents(students, classGender).catch((err) => console.error("Avatar type copy failed", err));
  }, [students, classGender]);

  // Students added or joined after the logo was uploaded get it copied on as soon as the teacher sees them.
  useEffect(() => {
    const logo = schoolLogo;
    if (!logo) return;
    const missing = students.filter((s) => s.schoolLogoURL !== logo && !healedLogoRef.current.has(`${s.id}|${logo}`));
    if (missing.length === 0) return;
    missing.forEach((s) => healedLogoRef.current.add(`${s.id}|${logo}`));
    applySchoolLogoToStudents(missing, logo).catch((err) => console.error("School logo copy failed", err));
  }, [students, schoolLogo]);
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
  const [addNameAr, setAddNameAr] = useState("");
  const [addNameEn, setAddNameEn] = useState("");
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
  const [certificateOpen, setCertificateOpen] = useState(false);

  // Reset (class-wide or single student)
  const [resettingClass, setResettingClass] = useState(false);
  const [resettingStudent, setResettingStudent] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [removingParentAccess, setRemovingParentAccess] = useState(false);

  // Student photo (edited by teacher from the detail panel)
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const detailPhotoInputRef = useRef<HTMLInputElement>(null);

  // Student name (edited by teacher from the detail panel)
  const [editingName, setEditingName] = useState(false);
  const [nameArDraft, setNameArDraft] = useState("");
  const [nameEnDraft, setNameEnDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

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

  // Class-champions board for whichever class tab is selected, shown in
  // the class header below. Recomputed from the points log every time the
  // selected class or the teacher's chosen date range changes (and whenever
  // this page opens), and shown straight from that result — so saving a new
  // range in the "Champions period" dialog updates the board right away,
  // without waiting on anything else. The result is also saved for the
  // student/parent portals inside computeAndSaveRankingForPeriod.
  useEffect(() => {
    if (!selectedClassId) {
      setRanking(null);
      return;
    }
    // Don't compute until the profile has loaded — otherwise the default
    // "last 7 days" range would be used (and saved) for a moment first.
    if (authLoading) return;

    // Never show another class's board under this class's name while loading.
    setRanking((prev) => (prev?.classId === selectedClassId ? prev : null));

    const period =
      profile?.rankingPeriodStart !== undefined && profile?.rankingPeriodEnd !== undefined
        ? { start: profile.rankingPeriodStart, end: profile.rankingPeriodEnd }
        : getDefaultRankingPeriod();

    let cancelled = false;
    computeAndSaveRankingForPeriod(selectedClassId, period)
      .then((result) => {
        if (cancelled) return;
        setRanking(result);
        setRankingError(false);
      })
      .catch((err) => {
        console.error("Could not compute the champions board", err);
        if (!cancelled) setRankingError(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassId, authLoading, profile?.rankingPeriodStart, profile?.rankingPeriodEnd]);

  useEffect(() => {
    if (!detailStudent) return;
    setResetDone(false);
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

  /** Puts a student in group A–E, or clears it when the student's current group is tapped again. */
  async function handleSetGroup(student: StudentRecord, group: StudentGroup) {
    const next = student.group === group ? deleteField() : group;
    await updateStudent(student.id, { group: next as unknown as StudentGroup });
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
    if (!selectedClassId || !addNameEn.trim() || !addNameAr.trim()) return;
    setAddSubmitting(true);
    try {
      await createStudentManual({
        classId: selectedClassId,
        name: primaryName(addNameEn, addNameAr),
        nameAr: addNameAr.trim(),
        nameEn: addNameEn.trim(),
        parentName: addParentName.trim() || undefined,
        parentEmail: addParentEmail.trim() || undefined,
      });
      setAddNameAr("");
      setAddNameEn("");
      setAddParentName("");
      setAddParentEmail("");
      setAddModalOpen(false);
    } finally {
      setAddSubmitting(false);
    }
  }

  function handleDownloadTemplate() {
    const csv = buildCsv(
      ["nameEn", "nameAr", "parentName", "parentEmail"],
      [
        ["Amina Al-Sayed", "أمينة السيد", "Fatima Al-Sayed", "fatima@example.com"],
        ["Yusuf Al-Rashid", "يوسف الراشد", "", ""],
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
        const legacy = row["name"] || row["student name"] || row["student"] || "";
        let nameEn = row["nameen"] || row["name_en"] || row["english name"] || "";
        let nameAr = row["namear"] || row["name_ar"] || row["arabic name"] || "";
        // Older files with a single "name" column: put it under the language it is written in.
        if (legacy && !nameEn && !nameAr) {
          if (/[\u0600-\u06FF]/.test(legacy)) nameAr = legacy;
          else nameEn = legacy;
        }
        const name = primaryName(nameEn, nameAr);
        const parentName = row["parentname"] || row["parent name"] || undefined;
        const parentEmail = row["parentemail"] || row["parent email"] || undefined;
        if (!name) return { name: "", error: t("students.bulkErrorMissingName") };
        if (!nameEn || !nameAr) return { name, nameAr, nameEn, parentName, parentEmail, error: t("students.bulkErrorMissingBoth") };
        return { name, nameAr, nameEn, parentName, parentEmail };
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
        validRows.map((r) => ({ name: r.name, nameAr: r.nameAr, nameEn: r.nameEn, parentName: r.parentName, parentEmail: r.parentEmail }))
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
    if (!window.confirm(t("students.confirmResetStudent", { name: dn(detailStudent) }))) return;
    setResettingStudent(true);
    setResetDone(false);
    try {
      await resetStudentData(detailStudent.id);
      setResetDone(true);
    } finally {
      setResettingStudent(false);
    }
  }

  async function handleRemoveParentAccess() {
    if (!detailStudent) return;
    const parentUids = detailStudent.parentUids || [];
    if (parentUids.length === 0) return;
    if (!window.confirm(t("students.confirmRemoveParentAccess", { name: dn(detailStudent) }))) return;
    setRemovingParentAccess(true);
    try {
      // Each removal only ever drops one entry from that parent's own
      // studentIds array — see firestore.rules — so these run one at a
      // time rather than in parallel to avoid two writes racing on the
      // same parent doc if a student somehow has more than one linked
      // parent account.
      for (const uid of parentUids) {
        await removeChildFromParent(uid, detailStudent.id);
      }
      await updateStudent(detailStudent.id, { parentUids: [], parentName: "", parentEmail: "" });
    } finally {
      setRemovingParentAccess(false);
    }
  }

  async function handleSaveClassType(gender: "boys" | "girls" | "mixed") {
    if (!selectedClassId) return;
    setSavingType(true);
    try {
      await updateClass(selectedClassId, { avatarGender: gender });
      await applyAvatarGenderToStudents(students, gender);
    } finally {
      setSavingType(false);
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
    const customText = pointsReason === "custom" ? pointsNote.trim() : "";
    if (pointsReason === "custom" && !customText) return;
    if (customText && rememberReason) await saveCustomReason(pointsModalStudent.classId, pointsAmount >= 0, customText);
    await awardPoints({
      studentId: pointsModalStudent.id,
      classId: pointsModalStudent.classId,
      amount: pointsAmount,
      reason: pointsReason,
      note: customText || undefined,
      awardedBy: user.uid,
    });
    setPointsModalStudent(null);
    setPointsAmount(1);
    setPointsNote("");
  }

  /** Keeps the selected reason valid for the current sign of the amount — resetting to that side's first option (and clearing the custom-detail box) the moment the sign flips. */
  function handlePointsAmountChange(next: number) {
    const flipped = (next < 0) !== (pointsAmount < 0);
    setPointsAmount(next);
    if (flipped) {
      setPointsReason(reasonsForAmount(next)[0]);
      setPointsNote("");
    }
  }

  function openDetail(student: StudentRecord) {
    setReportSent(false);
    setReportError("");
    setResetDone(false);
    setEditingName(false);
    setDetailStudent(student);
  }

  function startEditingName() {
    if (!detailStudent) return;
    // Students without separate names yet (e.g. joined with Google): put the old name under its own language.
    const old = detailStudent.name || "";
    const oldIsArabic = /[\u0600-\u06FF]/.test(old);
    setNameArDraft(detailStudent.nameAr || (oldIsArabic ? old : ""));
    setNameEnDraft(detailStudent.nameEn || (oldIsArabic ? "" : old));
    setEditingName(true);
  }

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!detailStudent) return;
    const nameAr = nameArDraft.trim();
    const nameEn = nameEnDraft.trim();
    const trimmed = primaryName(nameEn, nameAr);
    if (!nameAr || !nameEn) return;
    setSavingName(true);
    try {
      await updateStudent(detailStudent.id, { name: trimmed, nameAr, nameEn });
      // Keep the open window in step with what was just saved.
      setDetailStudent((prev) => (prev ? { ...prev, name: trimmed, nameAr, nameEn } : prev));
      setEditingName(false);
    } finally {
      setSavingName(false);
    }
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
      <div className="flex flex-col gap-3">
        <h1 className="whitespace-nowrap text-2xl font-semibold text-navy">{t("students.title")}</h1>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap [&>button]:w-full [&>button]:justify-center sm:[&>button]:w-auto">
          <button onClick={() => setAddModalOpen(true)} className="btn-primary text-sm py-2 px-3" disabled={!selectedClassId}>
            <Plus size={16} />
            {t("students.addStudent")}
          </button>
          <button
            onClick={() => setBulkModalOpen(true)}
            className={`btn-secondary text-sm py-2 px-3 ${SOLID_TONES.teal}`}
            disabled={!selectedClassId}
          >
            <Upload size={16} />
            {t("students.bulkImport")}
          </button>
          <button onClick={() => setReportModalOpen(true)} className={`btn-secondary text-sm py-2 px-3 ${SOLID_TONES.blue}`}>
            <FileSpreadsheet size={16} />
            {t("pointsReport.button")}
          </button>
          <button
            onClick={() => {
              setClassStatsTab("students");
              setClassStatsOpen(true);
            }}
            className={`btn-secondary text-sm py-2 px-3 ${SOLID_TONES.orange}`}
            disabled={!selectedClassId}
          >
            <BarChart3 size={16} />
            {t("reports.classStats")}
          </button>
          <button
            onClick={() => {
              setClassStatsTab("classes");
              setClassStatsOpen(true);
            }}
            className={`btn-secondary text-sm py-2 px-3 ${SOLID_TONES.lime}`}
            disabled={!selectedClassId}
          >
            <Scale size={16} />
            {t("reports.compareButton")}
          </button>
        </div>
      </div>

      <ClassSelector classes={classes} selectedClassId={selectedClassId} onSelect={setSelectedClassId} />

      <WeeklyChampions
        ranking={ranking}
        classLabel={classes.find((c) => c.id === selectedClassId)?.name}
        teacherView
      />
      {rankingError && <p className="text-sm text-red-600">{t("ranking.error")}</p>}

      {currentClass && !classGender && (
        <div className="card space-y-3 border-2 border-gold/60 p-4">
          <div>
            <h3 className="font-semibold text-navy">{t("avatars.bannerTitle")}</h3>
            <p className="text-sm text-cream-600">{t("avatars.bannerText")}</p>
          </div>
          <ClassTypeCard onSave={handleSaveClassType} saving={savingType} />
        </div>
      )}

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
                onClick={() => setCertificateOpen(true)}
                disabled={selectedIds.size === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-gold-600 disabled:opacity-50"
              >
                <Award size={14} />
                {t("certificate.button")}
              </button>
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
                <StudentAvatar photoURL={s.photoURL} name={dn(s)} size={52} rank={rankOf(ranking, s.id)} />
                <div className="flex-1">
                  <p className="font-semibold text-navy">{dn(s)}</p>
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
                    setPointsReason(POSITIVE_POINTS_REASONS[0]);
                    setPointsNote("");
                    setPointsModalStudent(s);
                  }}
                  className="btn-gold py-1.5 px-3 text-xs"
                >
                  <Award size={14} />
                  {t("points.modalTitle")}
                </button>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setStudentReportTarget(s);
                }}
                className="btn-secondary py-1.5 px-3 text-xs self-start"
              >
                <LineChart size={14} />
                {t("reports.studentReport")}
              </button>

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

              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                <span className="text-xs text-cream-600 me-1">{t("students.group")}</span>
                {STUDENT_GROUPS.map((g) => (
                  <button
                    key={g}
                    onClick={() => handleSetGroup(s, g)}
                    title={s.group === g ? t("students.groupClear") : t("students.groupSet", { group: g })}
                    className={`h-7 w-7 rounded-full border text-xs font-bold transition ${
                      s.group === g
                        ? "border-gold bg-gold text-white"
                        : "border-cream-400 bg-white text-navy/60 hover:border-gold/60 hover:text-navy"
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {detailStudent && classGender && (
        <AvatarPickerModal
          open={avatarPickerOpen}
          onClose={() => setAvatarPickerOpen(false)}
          title={`${t("avatars.chooseAvatar")} — ${dn(detailStudent)}`}
          pool={avatarPool(classGender)}
          taken={takenKeys(students.filter((x) => x.id !== detailStudent.id))}
          currentUrl={detailStudent.photoURL}
          onConfirm={async (url) => {
            await updateStudent(detailStudent.id, { photoURL: url });
          }}
          extra={
            <button
              type="button"
              onClick={() => detailPhotoInputRef.current?.click()}
              disabled={uploadingPhoto}
              className="btn-secondary text-sm"
            >
              <Upload size={14} />
              {uploadingPhoto ? t("common.loading") : t("avatars.uploadInstead")}
            </button>
          }
        />
      )}
      <StudentReportModal
        open={!!studentReportTarget}
        onClose={() => setStudentReportTarget(null)}
        student={studentReportTarget}
        className={classes.find((c) => c.id === studentReportTarget?.classId)?.name || ""}
      />
      <ClassStatsModal
        open={classStatsOpen}
        onClose={() => setClassStatsOpen(false)}
        classes={classes}
        defaultClassId={selectedClassId}
        initialTab={classStatsTab}
      />

      <PointsReportModal
        open={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        classes={classes}
        defaultClassId={selectedClassId}
      />

      <Modal
        open={!!pointsModalStudent}
        onClose={() => setPointsModalStudent(null)}
        title={`${t("points.modalTitle")} — ${pointsModalStudent ? dn(pointsModalStudent) : ""}`}
      >
        <form
          onSubmit={handleAwardPoints}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
              e.preventDefault();
            }
          }}
          className="space-y-4"
        >
          <div>
            <label className="label-eyebrow block mb-1.5">{t("points.amount")}</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handlePointsAmountChange(-Math.abs(pointsAmount || 1))}
                className={`h-9 w-9 shrink-0 flex items-center justify-center rounded-full border transition ${
                  pointsAmount < 0
                    ? "border-red-400 bg-red-50 text-red-600"
                    : "border-cream-300 text-cream-600 hover:border-red-400 hover:text-red-600"
                }`}
              >
                <Minus size={16} />
              </button>
              <input
                type="number"
                value={pointsAmount}
                onChange={(e) => handlePointsAmountChange(Number(e.target.value))}
                className="input-field text-center"
              />
              <button
                type="button"
                onClick={() => handlePointsAmountChange(Math.abs(pointsAmount || 1))}
                className={`h-9 w-9 shrink-0 flex items-center justify-center rounded-full border transition ${
                  pointsAmount > 0
                    ? "border-gold bg-gold-50 text-gold"
                    : "border-cream-300 text-cream-600 hover:border-gold hover:text-gold"
                }`}
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
          <div>
            <label className="label-eyebrow block mb-1.5">{t("points.reason")}</label>
            <ReasonPicker
              amount={pointsAmount}
              classId={pointsModalStudent?.classId || ""}
              reason={pointsReason}
              note={pointsNote}
              onChange={(r, n) => {
                setPointsReason(r);
                setPointsNote(n);
              }}
              remember={rememberReason}
              onRememberChange={setRememberReason}
            />
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
        title={detailStudent ? dn(detailStudent) : ""}
        widthClassName="max-w-2xl"
      >
        {detailStudent && (
          <div className="space-y-5">
            {editingName ? (
              <form onSubmit={handleSaveName} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label-eyebrow block mb-1">{t("students.nameAr")}</label>
                    <input autoFocus required dir="rtl" type="text" value={nameArDraft} onChange={(e) => setNameArDraft(e.target.value)} className="input-field" />
                  </div>
                  <div>
                    <label className="label-eyebrow block mb-1">{t("students.nameEn")}</label>
                    <input required dir="ltr" type="text" value={nameEnDraft} onChange={(e) => setNameEnDraft(e.target.value)} className="input-field" />
                  </div>
                </div>
                <p className="text-xs text-cream-600">{t("students.namesHint")}</p>
                <div className="flex items-center gap-2">
                  <button type="submit" disabled={savingName} className="btn-primary py-1.5 px-3 text-sm">
                    {savingName ? t("common.loading") : t("common.save")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingName(false)}
                    className="btn-secondary py-1.5 px-3 text-sm"
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={startEditingName}
                title={t("students.editName")}
                className="flex items-center gap-1.5 text-cream-600 hover:text-navy text-sm font-medium"
              >
                <Pencil size={13} />
                {t("students.editName")}
              </button>
            )}

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
                  onClick={() => (classGender ? setAvatarPickerOpen(true) : window.alert(t("avatars.setTypeFirst")))}
                  title={t("avatars.chooseAvatar")}
                  className="relative shrink-0 rounded-full group"
                >
                  <StudentAvatar
                    photoURL={detailStudent.photoURL}
                    name={dn(detailStudent)}
                    size={60}
                    rank={rankOf(ranking, detailStudent.id)}
                  />
                  <span className="absolute inset-0 flex items-center justify-center rounded-full bg-navy/55 opacity-0 transition-opacity group-hover:opacity-100">
                    <Images size={18} className="text-cream-100" />
                  </span>
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
              <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setStudentReportTarget(detailStudent)}
                className="btn-secondary py-1.5 px-3 text-sm"
              >
                <LineChart size={14} />
                {t("reports.studentReport")}
              </button>
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
            </div>

            {(detailStudent.parentName || detailStudent.parentEmail) && (
              <div>
                <h3 className="text-sm font-semibold text-navy mb-2">{t("students.parentPortalAccess")}</h3>
                <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg border border-cream-300 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-navy truncate">
                      {detailStudent.parentName || detailStudent.parentEmail}
                    </p>
                    {detailStudent.parentName && detailStudent.parentEmail && (
                      <p className="text-xs text-cream-600 truncate">{detailStudent.parentEmail}</p>
                    )}
                  </div>
                  {(detailStudent.parentUids || []).length > 0 ? (
                    <button
                      type="button"
                      onClick={handleRemoveParentAccess}
                      disabled={removingParentAccess}
                      className="text-sm font-semibold text-red-600 hover:text-red-700 inline-flex items-center gap-1.5 disabled:opacity-50 shrink-0"
                    >
                      <UserX size={14} />
                      {removingParentAccess ? t("common.loading") : t("students.removeParentAccess")}
                    </button>
                  ) : (
                    <span
                      className="text-xs text-cream-500 shrink-0"
                      title={t("students.removeParentAccessUnavailableHint")}
                    >
                      {t("students.removeParentAccessUnavailable")}
                    </span>
                  )}
                </div>
              </div>
            )}

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
              <h3 className="text-sm font-semibold text-navy mb-2">{t("points.history")}</h3>
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
                          <RichText html={n.contentHtml} text={n.content} />
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label-eyebrow block mb-1.5">{t("students.nameAr")}</label>
              <input required dir="rtl" value={addNameAr} onChange={(e) => setAddNameAr(e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="label-eyebrow block mb-1.5">{t("students.nameEn")}</label>
              <input required dir="ltr" value={addNameEn} onChange={(e) => setAddNameEn(e.target.value)} className="input-field" />
            </div>
          </div>
          <p className="text-xs text-cream-600">{t("students.namesHint")}</p>
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
                    {row.nameEn || row.nameAr ? [row.nameEn, row.nameAr].filter(Boolean).join(" — ") : t("students.bulkErrorMissingName")}
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

      <CertificateModal
        open={certificateOpen}
        onClose={() => setCertificateOpen(false)}
        selected={students.filter((s) => selectedIds.has(s.id))}
        roster={students}
        classId={selectedClassId}
        className={classes.find((c) => c.id === selectedClassId)?.name || ""}
        teacherId={user?.uid || ""}
      />
    </div>
  );
}
