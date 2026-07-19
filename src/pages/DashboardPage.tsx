import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, Users, CalendarCheck } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { subscribeToClasses } from "../lib/services/classesService";
import { subscribeToStudentCounts } from "../lib/services/studentsService";
import type { ClassRecord } from "../types";

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="card flex items-center gap-4 p-5">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold-50 text-gold">
        {icon}
      </div>
      <div>
        <p className="label-eyebrow">{label}</p>
        <p className="font-serif text-2xl font-semibold text-navy">{value}</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToClasses(user.uid, setClasses, console.error);
    return unsubscribe;
  }, [user]);

  useEffect(() => {
    const classIds = classes.map((c) => c.id);
    const unsubscribe = subscribeToStudentCounts(classIds, setStudentCounts, console.error);
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes.map((c) => c.id).join(",")]);

  const totalStudents = classes.reduce(
    (sum, c) => sum + (studentCounts[c.id] || 0),
    0
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-navy">{t("dashboard.title")}</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={<BookOpen size={22} />}
          label={t("dashboard.totalClasses")}
          value={classes.length}
        />
        <StatCard
          icon={<Users size={22} />}
          label={t("dashboard.totalStudents")}
          value={totalStudents}
        />
        <StatCard
          icon={<CalendarCheck size={22} />}
          label={t("dashboard.todayAttendance")}
          value="—"
        />
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-semibold text-navy mb-4">
          {t("classes.title")}
        </h2>
        {classes.length === 0 ? (
          <p className="text-sm text-cream-600">{t("classes.noClasses")}</p>
        ) : (
          <ul className="divide-y divide-cream-400">
            {classes.map((c) => (
              <li key={c.id} className="py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-navy">{c.name}</p>
                  {c.description && (
                    <p className="text-sm text-cream-600">{c.description}</p>
                  )}
                </div>
                <span className="pill bg-gold-50 text-gold">
                  {studentCounts[c.id] || 0} {t("classes.students")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
