import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Send, Check } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { subscribeToClasses } from "../lib/services/classesService";
import { subscribeToStudents } from "../lib/services/studentsService";
import { subscribeToAttendanceByClass } from "../lib/services/attendanceService";
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

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * This page is now a read-only reporting surface: attendance itself is only
 * ever recorded from inside a session's roster (Sessions page). Here a
 * teacher just reviews the attendance data that flagging produced, and can
 * email a parent a one-click progress report for whatever period is selected.
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

  // studentId -> sessionId -> status
  const matrixByStudent = useMemo(() => {
    const map = new Map<string, Map<string, AttendanceStatus>>();
    recordsInRange.forEach((r) => {
      if (!r.sessionId) return;
      if (!map.has(r.studentId)) map.set(r.studentId, new Map());
      map.get(r.studentId)!.set(r.sessionId, r.status);
    });
    return map;
  }, [recordsInRange]);

  const countsByStudent = useMemo(() => {
    const map = new Map<string, Record<AttendanceStatus, number>>();
    students.forEach((s) => map.set(s.id, { present: 0, absent: 0, late: 0, excused: 0 }));
    recordsInRange.forEach((r) => {
      const counts = map.get(r.studentId);
      if (counts) counts[r.status] += 1;
    });
    return map;
  }, [recordsInRange, students]);

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-semibold text-navy">{t("attendance.title")}</h1>
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

      <ClassSelector classes={classes} selectedClassId={selectedClassId} onSelect={setSelectedClassId} />

      {loading ? (
        <Spinner />
      ) : students.length === 0 ? (
        <EmptyState message={t("students.noStudents")} icon="📊" />
      ) : (
        <div className="space-y-4">
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
      )}
    </div>
  );
}
