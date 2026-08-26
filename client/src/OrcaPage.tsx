import { useState } from "react";
import { ClipboardList } from "lucide-react";
import RegisterPage from "./RegisterPage";
import { OrcaKriMappingModal } from "./OrcaKriMapping";

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

export default function OrcaPage() {
  const [mapping, setMapping] = useState<{
    orcaId?: number;
  } | null>(null);
  return (
    <>
      <RegisterPage
        type="orca"
        config={orcaConfig}
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
