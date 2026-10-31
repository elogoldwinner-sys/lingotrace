import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { useSchool } from "../../contexts/SchoolContext";

/** School name + signature / stamp block printed at the foot of every school-portal report (images are optional). */
export function SchoolSignBlock() {
  const { t } = useTranslation();
  const { school, assets } = useSchool();
  if (!school) return null;
  const hasImages = !!(assets.signatureURL || assets.stampURL);
  return (
    <div className="lt-avoid" style={{ marginTop: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24 }}>
      <div style={{ minWidth: 200 }}>
        <div style={{ height: 64, display: "flex", alignItems: "flex-end" }}>
          {assets.signatureURL && <img src={assets.signatureURL} alt="" style={{ maxHeight: 64, maxWidth: 200, objectFit: "contain" }} />}
        </div>
        <div style={{ borderTop: "1px solid #111827", paddingTop: 3, fontSize: 11, color: "#4b5563" }}>
          {t("sp.principalSignature", "School principal")}: {school.principalName}
        </div>
      </div>
      <div style={{ width: 96, height: 96, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#9ca3af" }}>
        {assets.stampURL ? (
          <img src={assets.stampURL} alt="" style={{ maxHeight: 96, maxWidth: 96, objectFit: "contain" }} />
        ) : !hasImages ? null : null}
      </div>
    </div>
  );
}

export function SchoolPrintedOn({ by }: { by: string }) {
  const { t } = useTranslation();
  return (
    <p className="lt-foot">
      {t("reports.printedOn", { date: format(new Date(), "yyyy-MM-dd HH:mm") })} · {by} · LingoTrace
    </p>
  );
}
