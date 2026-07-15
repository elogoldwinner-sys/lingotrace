import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { subscribeToClasses } from "../lib/services/classesService";
import { subscribeToStudents } from "../lib/services/studentsService";
import {
  subscribeToAttendanceByDate,
  recordAttendance,
  updateAttendance,
} from "../lib/services/attendanceService";
import type { ClassRecord, StudentRecord, AttendanceRecord, AttendanceStatus } from "../types";
import Spinner from "../components/common/Spinner";

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  present: "bg-green-100 text-green-700 border-green-300",
  absent: "bg-red-100 text-red-700 border-red-300",
  late: "bg-gold-100 text-gold-700 border-gold-300",
  excused: "bg-navy-100 text-navy border-navy-200",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function AttendancePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

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
    const unsubStudents = subscribeToStudents(selectedClassId, setStudents);
    setLoading(true);
    const unsubAttendance = subscribeToAttendanceByDate(
      selectedClassId,
      date,
      (data) => {
        setRecords(data);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => {
      unsubStudents();
      unsubAttendance();
    };
  }, [selectedClassId, date]);

  const recordByStudent = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    records.forEach((r) => map.set(r.studentId, r));
    return map;
  }, [records]);

  async function setStatus(studentId: string, status: AttendanceStatus) {
    const existing = recordByStudent.get(studentId);
    if (existing) {
      await updateAttendance(existing.id, { status });
    } else {
      await recordAttendance({ classId: selectedClassId, studentId, date, status });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-semibold text-navy">{t("attendance.title")}</h1>
        <div className="flex items-center gap-3">
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="input-field w-auto"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input-field w-auto"
          />
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <div className="card divide-y divide-cream-400">
          {students.map((s) => {
            const current = recordByStudent.get(s.id)?.status;
            return (
              <div key={s.id} className="flex items-center justify-between px-5 py-4">
                <span className="font-medium text-navy">{s.name}</span>
                <div className="flex gap-2">
                  {(["present", "absent", "late", "excused"] as AttendanceStatus[]).map(
                    (status) => (
                      <button
                        key={status}
                        onClick={() => setStatus(s.id, status)}
                        className={`pill border ${
                          current === status
                            ? STATUS_STYLES[status]
                            : "bg-white text-cream-600 border-cream-400"
                        }`}
                      >
                        {t(`attendance.${status}`)}
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
          {students.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-cream-600">
              {t("students.noStudents")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
