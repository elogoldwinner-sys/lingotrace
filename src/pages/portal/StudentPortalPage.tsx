import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { LogOut, Globe, Camera, Repeat } from "lucide-react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import StudentAvatar, { rankOf } from "../../components/avatars/StudentAvatar";
import AvatarPickerModal from "../../components/avatars/AvatarPickerModal";
import { avatarPool, takenKeys } from "../../lib/avatars";
import { useAuth } from "../../contexts/AuthContext";
import { subscribeToStudentPointsHistory } from "../../lib/services/pointsService";
import { subscribeToStudentAttendance } from "../../lib/services/attendanceService";
import { updateStudent } from "../../lib/services/studentsService";
import { getBadgeDefinition } from "../../lib/services/badgesService";
import { subscribeToAnnouncements, isAnnouncementVisibleTo } from "../../lib/services/announcementsService";
import { subscribeToClassRanking, getClassRankingOnce } from "../../lib/services/classRankingsService";
import {
  subscribeToClassAssignments,
  buildLinkedActivityUrl,
  subscribeToLinkedResult,
} from "../../lib/services/linkedActivityService";
import { triggerWeeklyChampionsCelebration } from "../../lib/confetti";
import type {
  PointsTransaction,
  AttendanceRecord,
  AttendanceStatus,
  Announcement,
  ClassRanking,
  LinkedAssignment,
  LinkedResult,
  StudentRecord,
} from "../../types";
import CertificatesSection from "../../components/portal/CertificatesSection";
import { useAwardedAssignmentIds } from "../../lib/hooks/useLinkedAwards";
import Spinner from "../../components/common/Spinner";
import Logo from "../../components/common/Logo";
import AnnouncementCard from "../../components/common/AnnouncementCard";
import WeeklyChampions from "../../components/common/WeeklyChampions";
import ThemeToggle from "../../components/common/ThemeToggle";
import { CloudLayer, StudyMascot } from "../../components/common/decorations";
import { useTheme } from "../../contexts/ThemeContext";

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  present: "bg-green-100 text-green-700",
  absent: "bg-red-100 text-red-700",
  late: "bg-gold-100 text-gold-700",
  excused: "bg-navy-100 text-navy",
};

/** One assigned exam's card for this student — a "Take exam" link, or the score once it's in. */
function LinkedActivityCard({ assignment, studentId }: { assignment: LinkedAssignment; studentId: string }) {
  const { t } = useTranslation();
  const [result, setResult] = useState<LinkedResult | null>(null);

  useEffect(() => {
    return subscribeToLinkedResult(assignment.id, studentId, setResult);
  }, [assignment.id, studentId]);

  return (
    <div className="flex items-center justify-between rounded-lg border border-cream-400 bg-cream-100 px-4 py-3">
      <span className="font-semibold text-navy">{assignment.title}</span>
      {result ? (
        <span className="rounded-full bg-teal-100 px-3 py-1 text-sm font-bold text-teal-700">
          {t("linked.scoreLabel", { score: result.score })}
        </span>
      ) : (
        <a
          href={buildLinkedActivityUrl(assignment, studentId)}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg bg-navy px-4 py-1.5 text-sm font-semibold text-cream-100 hover:bg-navy-700"
        >
          {t(assignment.source === "gatway" ? "linked.takeExam" : "linked.playGame")}
        </a>
      )}
    </div>
  );
}

export default function StudentPortalPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { profile, portalStudent, signOut, refreshPortalRole } = useAuth();
  // Same Google account may also be a teacher — offer a one-click switch
  // instead of a separate login (see AuthContext.resolveRole).
  const canSwitchToTeacher = !!profile;
  const { theme } = useTheme();
  const isKid = theme === "kid";
  const [pointsHistory, setPointsHistory] = useState<PointsTransaction[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [allAnnouncements, setAllAnnouncements] = useState<Announcement[]>([]);
  const [ranking, setRanking] = useState<ClassRanking | null>(null);
  const [linkedAssignments, setLinkedAssignments] = useState<LinkedAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [classmates, setClassmates] = useState<{ photoURL?: string }[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeToAnnouncements(setAllAnnouncements, console.error);
    return unsubscribe;
  }, []);

  // Only the announcements meant for this student's class (or for everyone).
  const announcements = useMemo(
    () => allAnnouncements.filter((a) => isAnnouncementVisibleTo(a, portalStudent?.classId ? [portalStudent.classId] : [])),
    [allAnnouncements, portalStudent?.classId]
  );

  useEffect(() => {
    if (!portalStudent) return;
    const unsubPoints = subscribeToStudentPointsHistory(portalStudent.id, (data) => {
      setPointsHistory(data);
      setLoading(false);
    });
    const unsubAttendance = subscribeToStudentAttendance(portalStudent.id, setAttendance);
    return () => {
      unsubPoints();
      unsubAttendance();
    };
  }, [portalStudent]);

  useEffect(() => {
    if (!portalStudent?.classId) return;
    const unsub = subscribeToClassRanking(portalStudent.classId, setRanking);
    return unsub;
  }, [portalStudent?.classId]);

  useEffect(() => {
    if (!portalStudent?.classId) {
      setLinkedAssignments([]);
      return;
    }
    return subscribeToClassAssignments(portalStudent.classId, setLinkedAssignments, (error) => {
      console.error("Failed to load linked assignments for", portalStudent.classId, error);
    });
  }, [portalStudent?.classId]);

  // Exams/games whose mark was already added to the points are hidden here (the points stay in the record).
  const { awardedIds, ready: awardsReady } = useAwardedAssignmentIds(
    linkedAssignments.map((a) => a.id),
    portalStudent?.id ?? ""
  );
  const visibleAssignments = awardsReady ? linkedAssignments.filter((a) => !awardedIds.has(a.id)) : [];

  // Celebrate once per portal visit (every login) if this student's class
  // currently has a weekly board.
  useEffect(() => {
    if (!portalStudent?.classId) return;
    let cancelled = false;
    getClassRankingOnce(portalStudent.classId).then((r) => {
      if (!cancelled && r && (r.positions || []).length > 0) triggerWeeklyChampionsCelebration();
    });
    return () => {
      cancelled = true;
    };
  }, [portalStudent?.classId]);

  async function handleSignOut() {
    await signOut();
    navigate("/portal-login");
  }

  function toggleLanguage() {
    i18n.changeLanguage(i18n.language === "ar" ? "en" : "ar");
  }

  /** Reads the classmates' current pictures, so the gallery can grey out the ones already taken. */
  async function openAvatarPicker() {
    if (!portalStudent) return;
    const snap = await getDocs(query(collection(db, "students"), where("classId", "==", portalStudent.classId)));
    setClassmates(snap.docs.filter((d) => d.id !== portalStudent.id).map((d) => ({ photoURL: (d.data() as StudentRecord).photoURL })));
    setAvatarOpen(true);
  }

  // One time only: the rules also refuse a second change once `avatarPicked` is set.
  async function handleAvatarChosen(url: string) {
    if (!portalStudent) return;
    await updateStudent(portalStudent.id, { photoURL: url, avatarPicked: true });
    await refreshPortalRole();
  }

  if (!portalStudent) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream relative overflow-hidden">
      {isKid && <CloudLayer className="absolute top-0 left-0 w-full h-64" />}
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-cream-400 bg-cream-100/90 px-3 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center gap-2">
          <Logo size={28} />
          <span className="font-serif text-xl font-semibold text-navy">{t("app.name")}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-1.5 rounded-lg border border-gold/40 px-3 py-1.5 text-xs font-semibold text-navy hover:bg-gold-50"
          >
            <Globe size={14} />
            {i18n.language === "ar" ? "EN" : "AR"}
          </button>
          {canSwitchToTeacher && (
            <button
              onClick={() => navigate("/dashboard")}
              className="flex items-center gap-1.5 rounded-lg border border-gold/40 px-3 py-1.5 text-xs font-semibold text-navy hover:bg-gold-50"
              title={t("nav.switchToTeacher")}
            >
              <Repeat size={14} />
              {t("nav.switchToTeacher")}
            </button>
          )}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-navy/70 hover:bg-cream-400/60"
          >
            <LogOut size={14} />
            {t("nav.signOut")}
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6 relative z-10">
        {isKid && (
          <div className="flex justify-center -mt-2 mb-2">
            <StudyMascot size={80} />
          </div>
        )}
        {announcements.map((a) => (
          <AnnouncementCard key={a.id} announcement={a} />
        ))}

        <WeeklyChampions ranking={ranking} />

        <div className="card p-6">
          <div className="flex items-center gap-4">
            {portalStudent.avatarGender && !portalStudent.avatarPicked ? (
              <button
                type="button"
                onClick={openAvatarPicker}
                title={t("avatars.studentChoose")}
                className="group relative shrink-0 rounded-full"
              >
                <StudentAvatar photoURL={portalStudent.photoURL} name={portalStudent.name} size={68} rank={rankOf(ranking, portalStudent.id)} />
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-navy/50 opacity-0 transition group-hover:opacity-100">
                  <Camera size={18} className="text-cream-100" />
                </span>
                <span className="absolute -bottom-1 start-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-white shadow rtl:translate-x-1/2">
                  {t("avatars.studentChooseShort")}
                </span>
              </button>
            ) : (
              <StudentAvatar photoURL={portalStudent.photoURL} name={portalStudent.name} size={68} rank={rankOf(ranking, portalStudent.id)} />
            )}
            <div>
              <p className="label-eyebrow mb-1">{t("portal.welcome")}</p>
              <h1 className="text-2xl font-semibold text-navy">{portalStudent.name}</h1>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <span className="text-3xl font-bold text-gold">{portalStudent.points}</span>
            <span className="text-sm text-cream-600">{t("students.points")}</span>
          </div>
        </div>

        {portalStudent.avatarGender && !portalStudent.avatarPicked && (
          <AvatarPickerModal
            open={avatarOpen}
            onClose={() => setAvatarOpen(false)}
            title={t("avatars.studentChoose")}
            pool={avatarPool(portalStudent.avatarGender)}
            taken={takenKeys(classmates)}
            currentUrl={portalStudent.photoURL}
            onConfirm={handleAvatarChosen}
            warning={t("avatars.studentWarning")}
          />
        )}

        <CertificatesSection studentId={portalStudent.id} kid={isKid} />

        {visibleAssignments.length > 0 && (
          <div className="card p-6">
            <h2 className="mb-3 text-lg font-semibold text-navy">{t("linked.title")}</h2>
            <div className="flex flex-col gap-2">
              {visibleAssignments.map((a) => (
                <LinkedActivityCard key={a.id} assignment={a} studentId={portalStudent.id} />
              ))}
            </div>
          </div>
        )}

        <div className="card p-6">
          <h2 className="text-lg font-semibold text-navy mb-4">{t("students.badges")}</h2>
          {portalStudent.badgeIds.length === 0 ? (
            <p className="text-sm text-cream-600">{t("portal.noBadgesYet")}</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {portalStudent.badgeIds.map((badgeId) => {
                const badge = getBadgeDefinition(badgeId);
                if (!badge) return null;
                return (
                  <div
                    key={badgeId}
                    className="flex items-center gap-2 rounded-lg border border-gold/30 bg-gold-50 px-3 py-2"
                    title={badge.description}
                  >
                    <span className="text-xl">{badge.icon}</span>
                    <span className="text-sm font-medium text-navy">{badge.name}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold text-navy mb-4">{t("portal.recentPoints")}</h2>
          {loading ? (
            <Spinner />
          ) : pointsHistory.length === 0 ? (
            <p className="text-sm text-cream-600">{t("portal.noPointsYet")}</p>
          ) : (
            <div className="divide-y divide-cream-400">
              {pointsHistory.slice(0, 10).map((txn) => (
                <div key={txn.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-navy">{t(`points.reasons.${txn.reason}`)}</p>
                    {txn.note && <p className="text-xs text-cream-600">{txn.note}</p>}
                  </div>
                  <span className={`font-semibold ${txn.amount >= 0 ? "text-green-700" : "text-red-700"}`}>
                    {txn.amount >= 0 ? "+" : ""}
                    {txn.amount}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold text-navy mb-4">{t("attendance.title")}</h2>
          {attendance.length === 0 ? (
            <p className="text-sm text-cream-600">{t("portal.noAttendanceYet")}</p>
          ) : (
            <div className="divide-y divide-cream-400">
              {attendance.slice(0, 10).map((record) => (
                <div key={record.id} className="flex items-center justify-between py-3">
                  <span className="text-sm text-navy">{record.date}</span>
                  <span className={`pill ${STATUS_STYLES[record.status]}`}>
                    {t(`attendance.${record.status}`)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
