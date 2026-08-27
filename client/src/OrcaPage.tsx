import { useState } from "react";
import { ClipboardList } from "lucide-react";
import RegisterPage from "./RegisterPage";
import { OrcaKriMappingModal } from "./OrcaKriMapping";
import OrcaDashboard from "./OrcaDashboard";

const LIKELIHOOD = [
  "",
  "5 - Frequent",
  "4 - Likely",
  "3 - Possible",
  "2 - Unlikely",
  "1 - Rare",
];
const IMPACT = [
  "",
  "5 - Critical",
  "4 - Major",
  "3 - Moderate",
  "2 - Minor",
  "1 - Incidental",
];
const STRATEGY = ["", "Mitigate", "Transfer/Share", "Accept", "Avoid"];
const EFFECTIVITY = ["", "Effective", "Needs Improvement", "No Control"];
const IMPACT_CATEGORY = [
  "",
  "Financial",
  "Reputational",
  "Operational/Service",
  "Compliance",
  "Legal",
  "Information Security",
];
const YES_NO = ["", "Y", "N"];
const STATUS = ["", "Open", "Closed"];

export const orcaConfig = {
  title: "ORCA",
  singular: "ORCA risk",
  icon: ClipboardList,
  pageSize: 50,
  expandableRows: true,
  filters: [
    ["process", "Process"],
    ["inherentLikelihood", "Inherent likelihood"],
    ["controlEffectivity", "Control effectivity"],
    ["residualLikelihoodRating", "Residual likelihood"],
    ["riskStrategy", "Risk strategy"],
    ["status", "Status"],
  ],
  defaultVisible: [
    "processNo",
    "process",
    "riskNo",
    "riskCategory",
    "riskThreat",
    "cause",
    "inherentLikelihood",
    "riskStrategy",
    "existingKeyControls",
    "controlEffectivity",
    "overallControlEffectivenessRemarks",
    "impactCategory",
    "impactPerRisk",
    "inherentImpactRating",
    "inherentRiskScore",
    "inherentRiskRatingRemarks",
    "residualLikelihoodRating",
    "residualImpactRating",
    "residualRiskScore",
    "residualRiskRemarks",
    "riskManagementRemarks",
    "actionItemRequired",
    "riskAcceptanceRequired",
    "riskAcceptanceFormLink",
    "actionItems",
    "targetCompletionDate",
    "status",
    "residualLikelihood",
    "residualImpact",
  ],
  fields: [
    ["processNo", "Process no.", "text"],
    ["process", "Process", "text"],
    ["riskNo", "Risk no.", "text"],
    ["riskCategory", "Risk category", "text"],
    ["riskThreat", "Risk / threat", "textarea"],
    ["cause", "Cause", "textarea"],
    ["inherentLikelihood", "Inherent likelihood", "select", LIKELIHOOD],
    ["riskStrategy", "Risk strategy", "select", STRATEGY],
    ["existingKeyControls", "Existing key controls per cause", "textarea"],
    ["controlEffectivity", "Control effectivity", "select", EFFECTIVITY],
    [
      "overallControlEffectivenessRemarks",
      "Overall control effectiveness (remarks)",
      "textarea",
    ],
    ["impactCategory", "Impact category", "select", IMPACT_CATEGORY],
    ["impactPerRisk", "Impact per risk", "textarea"],
    ["inherentImpactRating", "Inherent impact rating", "select", IMPACT],
    ["inherentRiskScore", "Inherent risk score", "number"],
    ["inherentRiskRatingRemarks", "Inherent risk rating remarks", "textarea"],
    [
      "residualLikelihoodRating",
      "Residual likelihood rating",
      "select",
      LIKELIHOOD,
    ],
    ["residualImpactRating", "Residual impact rating", "select", IMPACT],
    ["residualRiskScore", "Residual risk score", "number"],
    ["residualRiskRemarks", "Residual risk remarks", "textarea"],
    ["riskManagementRemarks", "Risk management remarks", "textarea"],
    ["actionItemRequired", "Action item required? (Y/N)", "select", YES_NO],
    [
      "riskAcceptanceRequired",
      "Risk acceptance required? (Y/N)",
      "select",
      YES_NO,
    ],
    ["riskAcceptanceFormLink", "Link to risk acceptance form", "url"],
    ["actionItems", "Action items", "textarea"],
    ["targetCompletionDate", "Target completion date", "date"],
    ["status", "Status", "select", STATUS],
    ["residualLikelihood", "Residual likelihood", "number"],
    ["residualImpact", "Residual impact", "number"],
  ],
};

function OrcaHubButton({
  active,
  label,
  src,
  onClick,
}: {
  active: boolean;
  label: string;
  src: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      className={active ? "orca-hub-btn active" : "orca-hub-btn"}
      aria-label={label}
      aria-selected={active}
      onClick={onClick}
    >
      <span className="orca-hub-mascot" aria-hidden="true">
        <img src={src} alt="" />
      </span>
      <span className="orca-hub-pill">{label}</span>
    </button>
  );
}

function OrcaWorkspaceHub({
  view,
  onChange,
}: {
  view: "register" | "dashboard";
  onChange: (view: "register" | "dashboard") => void;
}) {
  return (
    <div className="orca-hub" role="tablist" aria-label="ORCA workspaces">
      <OrcaHubButton
        active={view === "dashboard"}
        label="ORCA Dashboard"
        src="/assets/daxon-cartoon-orca-dashboard.png"
        onClick={() => onChange("dashboard")}
      />
      <OrcaHubButton
        active={view === "register"}
        label="ORCA Register"
        src="/assets/daxon-cartoon-orca-register.png"
        onClick={() => onChange("register")}
      />
    </div>
  );
}

export default function OrcaPage() {
  const [mapping, setMapping] = useState<{
    orcaId?: number;
  } | null>(null);
  const [view, setView] = useState<"register" | "dashboard">("register");
  const hub = <OrcaWorkspaceHub view={view} onChange={setView} />;

  if (view === "dashboard") {
    return (
      <div className="page">
        <div className="pagehead">
          <div>
            <h1>ORCA</h1>
            <p>Dashboard for the ORCA risk register</p>
          </div>
        </div>
        {hub}
        <OrcaDashboard />
      </div>
    );
  }

  return (
    <>
      <RegisterPage
        type="orca"
        config={orcaConfig}
        preamble={hub}
        extraActions={
          <button type="button" onClick={() => setMapping({})}>
            Mapping
          </button>
        }
        onMapRow={(row) => setMapping({ orcaId: row.id })}
      />
      {mapping && (
        <OrcaKriMappingModal
          side="orca"
          initialOrcaId={mapping.orcaId}
          onClose={() => setMapping(null)}
        />
      )}
    </>
  );
}
