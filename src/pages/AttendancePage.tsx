import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Send, Check } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { subscribeToClasses } from "../lib/services/classesService";
import { subscribeToStudents } from "../lib/services/studentsService";
import {
  subscribeToAttendanceByClass,
  setAttendanceStatusWithPoints,
} from "../lib/services/attendanceService";
import { subscribeToSessions } from "../lib/services/sessionsService";
import { sendPeriodReportToParent } from "../lib/services/reportService";
import type { ClassRecord, StudentRecord, AttendanceRecord, AttendanceStatus, SessionRecord } from "../types";
import Spinner from "../components/common/Spinner";
import EmptyState from "../components/common/EmptyState";
import ClassSelector from "../components/common/ClassSelector";

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  present: "bg-green-100 text-green-700 border-green-300",
  absent: "bg-red-100 text-red-700 border-red-300",
  late: "bg-gold-100 text-gold-700 border-gold-300",
  excused: "bg-navy-100 text-navy border-navy-200",
};

const STATUS_ABBR: Record<AttendanceStatus, string> = {
  present: "P",
  absent: "A",
  late: "L",
  excused: "E",
};

const ATTENDANCE_STATUSES: AttendanceStatus[] = ["present", "absent", "late", "excused"];

// Points auto-granted the instant a status is marked. Showing up (present/late)
// earns the default point; absent/excused earn none. Re-marking a student to a
// different status only awards/deducts the difference (see handleSetStatus).
const ATTENDANCE_POINTS: Record<AttendanceStatus, number> = {
  present: 1,
  late: 1,
  absent: 0,
  excused: 0,
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * This is now the ONLY place attendance is recorded (moved off the Sessions
 * page, which just displays the resulting status read-only). Marking a
 * status here also grants/adjusts the student's points instantly (same
 * plain-write + increment() approach used everywhere else, so there's no
 * transaction round-trip delay). The session list below "Record attendance"
 * is pulled straight from the live `sessions` collection — the same one
 * Sessions page and bulk-generate both write to — so the number of entries
 * here always exactly matches the number of sessions, automatically,
 * including right after a bulk-generate.
 */
export default function AttendancePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  const [startDate, setStartDate] = useState(daysAgoISO(30));
  const [endDate, setEndDate] = useState(todayISO());

  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToClasses(user.uid, (data) => {
      setClasses(data);
      if (!selectedClassId && data.length > 0) setSelectedClassId(data[0].id);
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!selectedClassId) return;
    setLoading(true);
    setExpandedSessionId(null);
    const unsubStudents = subscribeToStudents(selectedClassId, setStudents);
    const unsubSessions = subscribeToSessions(selectedClassId, setSessions);
    const unsubAttendance = subscribeToAttendanceByClass(
      selectedClassId,
      (data) => {
        setRecords(data);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => {
      unsubStudents();
      unsubSessions();
      unsubAttendance();
    };
  }, [selectedClassId]);

  const sessionsInRange = useMemo(
    () =>
      [...sessions]
        .filter((s) => s.date >= startDate && s.date <= endDate)
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
    [sessions, startDate, endDate]
  );

  const recordsInRange = useMemo(
    () => records.filter((r) => r.date >= startDate && r.date <= endDate),
    [records, startDate, endDate]
  );

  // studentId -> sessionId -> status (report table, date-range limited)
  const matrixByStudent = useMemo(() => {
    const map = new Map<string, Map<string, AttendanceStatus>>();
    recordsInRange.forEach((r) => {
      if (!r.sessionId) return;
      if (!map.has(r.studentId)) map.set(r.studentId, new Map());
      map.get(r.studentId)!.set(r.sessionId, r.status);
    });
    return map;
  }, [recordsInRange]);

  // studentId -> sessionId -> record (marking accordion, NOT date-range limited)
  const recordByStudentAndSession = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    records.forEach((r) => {
      if (!r.sessionId) return;
      map.set(`${r.studentId}:${r.sessionId}`, r);
    });
    return map;
  }, [records]);

  const countsByStudent = useMemo(() => {
    const map = new Map<string, Record<AttendanceStatus, number>>();
    students.forEach((s) => map.set(s.id, { present: 0, absent: 0, late: 0, excused: 0 }));
    recordsInRange.forEach((r) => {
      const counts = map.get(r.studentId);
      if (counts) counts[r.status] += 1;
    });
    return map;
  }, [recordsInRange, students]);

  async function handleSetStatus(student: StudentRecord, session: SessionRecord, status: AttendanceStatus) {
    if (!user) return;
    const existing = recordByStudentAndSession.get(`${student.id}:${session.id}`);
    const newPoints = ATTENDANCE_POINTS[status];
    const previousPoints = existing?.pointsAwarded || 0;

    // Plain writes with a local optimistic echo — no transaction round-trip,
    // so the badge and the student's score both update the instant this fires.
    await setAttendanceStatusWithPoints({
      attendanceId: existing?.id,
      classId: session.classId,
      studentId: student.id,
      date: session.date,
      sessionId: session.id,
      status,
      newPoints,
      previousPoints,
      awardedBy: user.uid,
    });
  }

  async function handleSendReport(student: StudentRecord) {
    const className = classes.find((c) => c.id === selectedClassId)?.name || "";
    setSendingId(student.id);
    setErrorId(null);
    setSentId(null);
    try {
      await sendPeriodReportToParent({
        studentId: student.id,
        className,
        startDate,
        endDate,
      });
      setSentId(student.id);
      setTimeout(() => setSentId(null), 3000);
    } catch {
      setErrorId(student.id);
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-navy">{t("attendance.title")}</h1>

      <ClassSelector classes={classes} selectedClassId={selectedClassId} onSelect={setSelectedClassId} />

      {loading ? (
        <Spinner />
      ) : students.length === 0 ? (
        <EmptyState message={t("students.noStudents")} icon="📊" />
      ) : (
        <div className="space-y-8">
          <div>
            <h2 className="text-lg font-semibold text-navy mb-1">{t("attendance.recordTitle")}</h2>
            <p className="text-xs text-cream-600 mb-3">{t("attendance.recordHint")}</p>

            {sessions.length === 0 ? (
              <EmptyState message={t("sessions.noSessions")} icon="📝" />
            ) : (
              <div className="card divide-y divide-cream-400">
                {sessions.map((s) => (
                  <div key={s.id}>
                    <button
                      onClick={() => setExpandedSessionId(expandedSessionId === s.id ? null : s.id)}
                      className={`w-full text-left flex items-start justify-between px-5 py-4 transition-colors ${
                        expandedSessionId === s.id ? "bg-gold-50" : "hover:bg-cream-300/40"
                      }`}
                    >
                      <div>
                        <p className="font-semibold text-navy">{s.title}</p>
                        <p className="text-xs text-cream-600">{s.date}</p>
                      </div>
                    </button>

                    {expandedSessionId === s.id && (
                      <div className="px-5 pb-5 space-y-2 bg-cream-100/60 pt-2">
                        {students.map((st) => {
                          const currentStatus = recordByStudentAndSession.get(`${st.id}:${s.id}`)?.status;
                          return (
                            <div
                              key={st.id}
                              className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-cream-300 bg-white px-3 py-2.5"
                            >
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                {st.photoURL ? (
                                  <img
                                    src={st.photoURL}
                                    alt={st.name}
                                    className="h-9 w-9 rounded-full object-cover border border-gold/40 shrink-0"
                                  />
                                ) : (
                                  <div className="h-9 w-9 shrink-0 rounded-full bg-navy text-cream-100 flex items-center justify-center text-sm font-semibold">
                                    {st.name[0]?.toUpperCase()}
                                  </div>
                                )}
                                <p className="text-sm font-semibold text-navy truncate">{st.name}</p>
                              </div>
                              <div className="flex gap-1.5 shrink-0">
                                {ATTENDANCE_STATUSES.map((status) => (
                                  <button
                                    key={status}
                                    onClick={() => handleSetStatus(st, s, status)}
                                    className={`pill border text-xs ${
                                      currentStatus === status
                                        ? STATUS_STYLES[status]
                                        : "bg-white text-cream-600 border-cream-400"
                                    }`}
                                  >
                                    {t(`attendance.${status}`)}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
              <h2 className="text-lg font-semibold text-navy">{t("attendance.report")}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <div>
                  <label className="label-eyebrow block mb-1 text-[10px]">{t("sessions.startDate")}</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="input-field w-auto"
                  />
                </div>
                <div>
                  <label className="label-eyebrow block mb-1 text-[10px]">{t("sessions.endDate")}</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="input-field w-auto"
                  />
                </div>
              </div>
            </div>

            <div className="card p-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-cream-600">
                    <th className="py-2 pr-4">{t("students.title")}</th>
                    {sessionsInRange.map((s) => (
                      <th key={s.id} className="py-2 px-2 text-center whitespace-nowrap font-medium">
                        {s.date}
                      </th>
                    ))}
                    <th className="py-2 px-2 text-center">{t("attendance.present")}</th>
                    <th className="py-2 px-2 text-center">{t("attendance.late")}</th>
                    <th className="py-2 px-2 text-center">{t("attendance.absent")}</th>
                    <th className="py-2 px-2 text-center">{t("attendance.excused")}</th>
                    <th className="py-2 pl-2 text-right">{t("attendance.report")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-400">
                  {students.map((st) => {
                    const counts = countsByStudent.get(st.id) || {
                      present: 0,
                      absent: 0,
                      late: 0,
                      excused: 0,
                    };
                    const perSession = matrixByStudent.get(st.id);
                    return (
                      <tr key={st.id}>
                        <td className="py-2 pr-4 font-medium text-navy whitespace-nowrap">{st.name}</td>
                        {sessionsInRange.map((s) => {
                          const status = perSession?.get(s.id);
                          return (
                            <td key={s.id} className="py-2 px-2 text-center">
                              {status ? (
                                <span className={`pill border text-xs ${STATUS_STYLES[status]}`}>
                                  {STATUS_ABBR[status]}
                                </span>
                              ) : (
                                <span className="text-cream-400">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="py-2 px-2 text-center text-green-700 font-semibold">{counts.present}</td>
                        <td className="py-2 px-2 text-center text-gold-700 font-semibold">{counts.late}</td>
                        <td className="py-2 px-2 text-center text-red-700 font-semibold">{counts.absent}</td>
                        <td className="py-2 px-2 text-center text-navy font-semibold">{counts.excused}</td>
                        <td className="py-2 pl-2 text-right">
                          <button
                            onClick={() => handleSendReport(st)}
                            disabled={sendingId === st.id || !st.parentEmail}
                            title={!st.parentEmail ? t("attendance.noParentEmail") : t("attendance.sendReport")}
                            className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-50"
                          >
                            {sentId === st.id ? (
                              <Check size={14} />
                            ) : (
                              <Send size={14} />
                            )}
                            {sendingId === st.id
                              ? t("common.loading")
                              : sentId === st.id
                                ? t("attendance.sent")
                                : t("attendance.sendReport")}
                          </button>
                          {errorId === st.id && (
                            <p className="text-xs text-red-600 mt-1">{t("attendance.sendError")}</p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
