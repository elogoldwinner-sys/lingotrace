import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { FileText, Users } from "lucide-react";
import Spinner from "../../components/common/Spinner";
import { useSchoolData } from "../../components/school/SchoolDataContext";
import { useSchool } from "../../contexts/SchoolContext";
import { groupByGrade } from "../../lib/school/scope";
import type { ClassRecord, StudentRecord } from "../../types";

const chip = (active: boolean) =>
  `rounded-full border px-4 py-2 text-sm font-bold transition ${
    active ? "border-navy bg-navy text-white" : "border-cream-400 bg-white text-navy hover:border-gold/60"
  }`;

/** Grade → class (section) → subject → students, for everything this person is allowed to see. */
export default function SchoolOverviewPage() {
  const { t } = useTranslation();
  const { staff } = useSchool();
  const { classes, teachers, loading, error, teacherName, getStudents } = useSchoolData();
  const grouped = useMemo(() => groupByGrade(classes), [classes]);
  const grades = useMemo(() => Array.from(grouped.keys()).sort((a, b) => a - b), [grouped]);
  const [grade, setGrade] = useState<number | null>(null);
  const [section, setSection] = useState<string | null>(null);
  const [openClass, setOpenClass] = useState<string | null>(null);
  const [students, setStudents] = useState<Record<string, StudentRecord[]>>({});
  const [loadingStudents, setLoadingStudents] = useState(false);

  useEffect(() => {
    if (grade == null && grades.length > 0) setGrade(grades[0]);
  }, [grades, grade]);

  const sections = grade != null ? Array.from(grouped.get(grade)?.keys() || []).sort() : [];
  useEffect(() => {
    if (sections.length > 0 && (!section || !sections.includes(section))) setSection(sections[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grade, classes]);

  const subjectClasses: ClassRecord[] = grade != null && section ? grouped.get(grade)?.get(section) || [] : [];
  const unassigned = classes.filter((c) => c.grade == null);

  async function toggleClass(c: ClassRecord) {
    if (openClass === c.id) {
      setOpenClass(null);
      return;
    }
    setOpenClass(c.id);
    if (!students[c.id]) {
      setLoadingStudents(true);
      try {
        const list = await getStudents(c.id);
        setStudents((p) => ({ ...p, [c.id]: list }));
      } finally {
        setLoadingStudents(false);
      }
    }
  }

  if (loading) return <Spinner />;
  if (error) return <p className="text-sm text-red-600">{t("sp.loadError", "Couldn't load the schools. Please try again.")}</p>;

  const approved = teachers.filter((m) => m.status === "approved").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy">{t("sp.overviewTitle", "School overview")}</h1>
        <p className="text-sm text-cream-600">
          {t("sp.overviewSub", { defaultValue: "{{grades}} grades · {{classes}} classes · {{teachers}} teachers", grades: grades.length, classes: classes.length, teachers: approved })}
          {staff?.role === "counselor" ? ` · ${t("sp.yourScope", "Showing the classes assigned to you")}` : ""}
        </p>
      </div>

      {classes.length === 0 ? (
        <div className="card p-8 text-center text-sm text-cream-600">
          {t("sp.noClasses", "No classes to show yet. Classes appear here once teachers are approved and set their grade and section.")}
        </div>
      ) : (
        <>
          <div>
            <p className="label-eyebrow mb-2">{t("sp.grade", "Grade")}</p>
            <div className="flex flex-wrap gap-2">
              {grades.map((g) => (
                <button key={g} type="button" className={chip(grade === g)} onClick={() => { setGrade(g); setOpenClass(null); }}>
                  {t("sp.gradeN", { defaultValue: "Grade {{n}}", n: g })}
                </button>
              ))}
            </div>
          </div>
          {grade != null && (
            <div>
              <p className="label-eyebrow mb-2">{t("sp.classesOfGrade", "Classes")}</p>
              <div className="flex flex-wrap gap-2">
                {sections.map((s) => (
                  <button key={s} type="button" className={chip(section === s)} onClick={() => { setSection(s); setOpenClass(null); }}>
                    {grade}-{s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {subjectClasses.map((c) => (
              <div key={c.id} className="card overflow-hidden">
                <button type="button" onClick={() => toggleClass(c)} className="flex w-full flex-wrap items-center justify-between gap-2 p-4 text-start hover:bg-cream-100">
                  <span>
                    <span className="block font-semibold text-navy">{c.subject || t("sp.noSubject", "No subject")}</span>
                    <span className="block text-xs text-cream-600">{teacherName(c)}</span>
                  </span>
                  <span className="pill bg-gold-50 text-gold">
                    <Users size={12} className="me-1 inline" />
                    {t("sp.students", "Students")}
                  </span>
                </button>
                {openClass === c.id && (
                  <div className="border-t border-cream-400/70 p-4">
                    {loadingStudents && !students[c.id] ? (
                      <Spinner />
                    ) : (students[c.id] || []).length === 0 ? (
                      <p className="text-sm text-cream-600">{t("sp.noStudents", "No students in this class yet.")}</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-start text-xs text-cream-600">
                              <th className="py-1 text-start">{t("reports.student")}</th>
                              <th className="py-1 text-end">{t("sp.totalPoints", "Total points")}</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {students[c.id].map((s) => (
                              <tr key={s.id} className="border-t border-cream-400/50">
                                <td className="py-1.5 font-semibold text-navy">{s.name}</td>
                                <td className="py-1.5 text-end">{s.points}</td>
                                <td className="py-1.5 text-end">
                                  <Link to={`/school/reports?class=${c.id}&student=${s.id}`} className="inline-flex items-center gap-1 text-xs font-bold text-gold hover:underline">
                                    <FileText size={13} />
                                    {t("sp.report", "Report")}
                                  </Link>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <Link to={`/school/reports?class=${c.id}`} className="btn-secondary mt-3 inline-flex text-xs">
                      <FileText size={14} />
                      {t("sp.classReport", "Class report")}
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {unassigned.length > 0 && (
        <p className="text-xs text-cream-600">{t("sp.unassigned", { defaultValue: "{{n}} class(es) have no grade/section yet and are not shown.", n: unassigned.length })}</p>
      )}
    </div>
  );
}
