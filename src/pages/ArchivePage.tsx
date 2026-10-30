import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ClipboardList, CalendarCheck } from "lucide-react";
import SessionsPage from "./SessionsPage";
import AttendancePage from "./AttendancePage";

/** Archive with two subsections — Sessions and Attendance — each showing the weeks older than last week. */
export default function ArchivePage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "attendance" ? "attendance" : "sessions";
  const tabCls = (active: boolean) =>
    `flex items-center gap-2 rounded-lg border-2 px-4 py-2 text-sm font-semibold transition-colors ${
      active ? "border-navy bg-navy text-cream-100" : "border-cream-400 bg-white text-navy hover:bg-cream-300"
    }`;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={tabCls(tab === "sessions")} onClick={() => setParams({})}>
          <ClipboardList size={16} />
          {t("archive.sessions")}
        </button>
        <button type="button" className={tabCls(tab === "attendance")} onClick={() => setParams({ tab: "attendance" })}>
          <CalendarCheck size={16} />
          {t("archive.attendance")}
        </button>
      </div>
      {tab === "attendance" ? <AttendancePage archived /> : <SessionsPage archived />}
    </div>
  );
}
