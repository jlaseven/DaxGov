import { differenceInCalendarDays } from "date-fns";
import { z } from "zod";

export const tpsaStatuses = [
  "Draft",
  "Ready to Send",
  "Sent",
  "Awaiting Vendor Submission",
  "Submitted",
  "Under Cybersecurity Review",
  "Clarification Required",
  "Additional Evidence Required",
  "Remediation Required",
  "Pending Risk Acceptance",
  "Pending Reassessment",
  "Conditionally Completed",
  "Completed",
  "Suspended",
  "Archived",
] as const;
export const tpsaVerdicts = [
  "Pending",
  "Passed",
  "Reassessment Required",
  "Security Assessment Failed",
] as const;
export function nextTpsaId(year: number, latestReference?: string | null) {
  const sequence = latestReference
    ? Number(latestReference.split("-").at(-1)) + 1
    : 1;
  return `TPSA-${year}-${String(sequence).padStart(4, "0")}`;
}
export const httpUrl = z
  .string()
  .url()
  .refine(
    (value) => /^https?:\/\//i.test(value),
    "URL must start with http:// or https://",
  )
  .nullish();
const optionalText = z.string().trim().max(10000).nullish();
const optionalDate = z
  .union([
    z.date(),
    z
      .string()
      .date()
      .transform((value) => new Date(`${value}T00:00:00`)),
  ])
  .nullish()
  .transform((value) => value || null);

export const tpsaSchema = z
  .object({
    vendorName: z.string().trim().min(1, "Vendor name is required"),
    vendorLegalEntity: optionalText,
    productService: z.string().trim().min(1, "Product or service is required"),
    businessProcessOwner: optionalText,
    department: optionalText,
    reviewerName: z.string().trim().min(1, "Assigned reviewer is required"),
    vendorType: z.enum(["New Vendor", "Existing Vendor"]),
    vendorTier: z.enum([
      "Tier 1 – Critical",
      "Tier 2 – High",
      "Tier 3 – Standard",
      "Not Yet Assigned",
    ]),
    tierJustification: optionalText,
    tierAssignedBy: optionalText,
    tierAssignmentDate: optionalDate,
    assessmentType: z.enum([
      "Certification-Based Review",
      "Expedited TPSA",
      "Scoped TPSA",
      "Full TPSA",
      "Evidence-Based Reassessment",
      "Scoped Reassessment",
      "Full Reassessment",
      "Not Yet Determined",
    ]),
    assessmentReason: optionalText,
    assessmentScope: optionalText,
    businessCriticality: z
      .enum(["Critical", "High", "Medium", "Low"])
      .nullish(),
    status: z.enum(tpsaStatuses),
    verdict: z.enum(tpsaVerdicts),
    verdictDate: optionalDate,
    verdictIssuedBy: optionalText,
    verdictJustification: optionalText,
    conditionsRestrictions: optionalText,
    requiredEvidenceReceived: z.boolean(),
    cybersecurityReviewCompleted: z.boolean(),
    sentDate: optionalDate,
    submissionDeadline: optionalDate,
    submittedDate: optionalDate,
    reviewStartDate: optionalDate,
    reviewDeadline: optionalDate,
    reviewCompletedDate: optionalDate,
    remediationDeadline: optionalDate,
    lastFollowUpDate: optionalDate,
    nextFollowUpDate: optionalDate,
    nextReassessmentDate: optionalDate,
    openCriticalFindings: z.number().int().min(0),
    openHighFindings: z.number().int().min(0),
    openMediumFindings: z.number().int().min(0),
    openLowFindings: z.number().int().min(0),
    findingsSummary: optionalText,
    compensatingControls: optionalText,
    highFindingsTreatmentStatus: z.enum([
      "Not Applicable",
      "Pending",
      "Remediated",
      "Mitigated",
      "Risk Accepted",
      "Partially Treated",
    ]),
    remediationNotes: optionalText,
    rafStatus: z.enum([
      "Not Required",
      "Not Yet Submitted",
      "Pending Approval",
      "Approved",
      "Rejected",
      "Expired",
    ]),
    rafLink: httpUrl,
    rafApprovalDate: optionalDate,
    rafExpirationDate: optionalDate,
    rafApprovingAuthority: optionalText,
    rafConditions: optionalText,
    rafNotes: optionalText,
    questionnaireLink: httpUrl,
    evidenceFolderLink: httpUrl,
    assessmentReportLink: httpUrl,
    otherDocumentLink: httpUrl,
    remarks: optionalText,
    reassessmentTrigger: optionalText,
  })
  .superRefine((data, context) => {
    const error = (path: string, message: string) =>
      context.addIssue({ code: "custom", path: [path], message });
    if (data.vendorTier !== "Not Yet Assigned" && !data.tierJustification)
      error("tierJustification", "Tier justification is required");
    const ordered: [
      Date | null | undefined,
      Date | null | undefined,
      string,
      string,
    ][] = [
      [
        data.sentDate,
        data.submissionDeadline,
        "submissionDeadline",
        "Submission deadline cannot be before sent date",
      ],
      [
        data.sentDate,
        data.submittedDate,
        "submittedDate",
        "Submitted date cannot be before sent date",
      ],
      [
        data.submittedDate,
        data.reviewStartDate,
        "reviewStartDate",
        "Review start cannot be before submitted date",
      ],
      [
        data.reviewStartDate,
        data.reviewDeadline,
        "reviewDeadline",
        "Review deadline cannot be before review start",
      ],
      [
        data.reviewStartDate,
        data.reviewCompletedDate,
        "reviewCompletedDate",
        "Review completion cannot be before review start",
      ],
      [
        data.reviewCompletedDate,
        data.remediationDeadline,
        "remediationDeadline",
        "Remediation deadline cannot be before review completion",
      ],
      [
        data.verdictDate,
        data.nextReassessmentDate,
        "nextReassessmentDate",
        "Reassessment cannot be before verdict date",
      ],
      [
        data.rafApprovalDate,
        data.rafExpirationDate,
        "rafExpirationDate",
        "RAF expiration cannot be before approval date",
      ],
    ];
    for (const [start, end, path, message] of ordered)
      if (start && end && end < start) error(path, message);
    if (
      data.status === "Under Cybersecurity Review" &&
      data.assessmentType === "Not Yet Determined"
    )
      error("assessmentType", "Assessment type is required before review");
    if (data.rafStatus === "Approved") {
      if (!data.rafApprovalDate)
        error("rafApprovalDate", "RAF approval date is required");
      if (!data.rafApprovingAuthority)
        error("rafApprovingAuthority", "RAF approving authority is required");
      if (!data.rafLink)
        error("rafLink", "RAF link is required for an approved RAF");
    }
    if (data.verdict === "Passed")
      for (const message of passedVerdictBlockers(data))
        error("verdict", message);
  });

export function passedVerdictBlockers(data: any) {
  const blockers: string[] = [];
  if (!data.sentDate)
    blockers.push("Passed is blocked because the TPSA sent date is missing.");
  if (!data.submittedDate)
    blockers.push(
      "Passed is blocked because the vendor submission date is missing.",
    );
  if (!data.cybersecurityReviewCompleted)
    blockers.push(
      "Passed is blocked because the cybersecurity review is incomplete.",
    );
  if (!data.requiredEvidenceReceived)
    blockers.push(
      "Passed is blocked because required evidence has not been received.",
    );
  if (data.openCriticalFindings > 0)
    blockers.push(
      "Passed is blocked because an open Critical finding remains.",
    );
  if (
    data.openHighFindings > 0 &&
    !["Remediated", "Mitigated", "Risk Accepted", "Not Applicable"].includes(
      data.highFindingsTreatmentStatus,
    )
  )
    blockers.push("Passed is blocked because High findings are not treated.");
  if (
    data.openHighFindings > 0 &&
    data.highFindingsTreatmentStatus === "Risk Accepted" &&
    data.rafStatus !== "Approved"
  )
    blockers.push(
      "Passed is blocked because Risk Accepted High findings require an approved RAF.",
    );
  if (
    ["Clarification Required", "Additional Evidence Required"].includes(
      data.status,
    )
  )
    blockers.push(
      `Passed is blocked because the assessment remains in ${data.status} status.`,
    );
  if (!data.verdictJustification)
    blockers.push(
      "Passed is blocked because verdict justification is missing.",
    );
  if (data.vendorTier === "Not Yet Assigned")
    blockers.push("Passed is blocked because the vendor tier is not assigned.");
  return blockers;
}

export function tpsaChangeIssues(
  previous: any,
  next: any,
  metadata: { changeReason?: string; rafLinkReplacementConfirmed?: boolean },
) {
  const issues: string[] = [];
  const reason = metadata.changeReason?.trim();
  if (previous.verdict !== next.verdict && !reason)
    issues.push("A reason is required when changing the final verdict.");
  if (previous.vendorTier !== next.vendorTier && !reason)
    issues.push("A reason is required when changing the vendor tier.");
  for (const [field, label] of [
    ["submissionDeadline", "submission deadline"],
    ["remediationDeadline", "remediation deadline"],
  ] as const) {
    const before = previous[field] ? new Date(previous[field]) : null;
    const after = next[field] ? new Date(next[field]) : null;
    if (before && after && after > before && !reason)
      issues.push(`A reason is required when extending the ${label}.`);
  }
  if (
    previous.rafLink &&
    next.rafLink &&
    previous.rafLink !== next.rafLink &&
    !metadata.rafLinkReplacementConfirmed
  )
    issues.push(
      "Confirmation is required before replacing an existing RAF link.",
    );
  return issues;
}

export function tpsaProgress(records: any[]) {
  const readyToSend = records.filter(
    (record) => record.status === "Ready to Send",
  ).length;
  const sentRecords = records.filter((record) => Boolean(record.sentDate));
  const completed = sentRecords.filter(
    (record) => record.status === "Completed",
  ).length;
  return {
    readyToSend,
    sent: sentRecords.length,
    completed,
    completionRate: sentRecords.length
      ? Math.round((completed / sentRecords.length) * 100)
      : 0,
  };
}

export function tpsaMetrics(record: any, now = new Date()) {
  const daysOutstanding = record.sentDate
    ? differenceInCalendarDays(record.submittedDate || now, record.sentDate)
    : null;
  const daysOverdue = record.submissionDeadline
    ? Math.max(
        0,
        differenceInCalendarDays(
          record.submittedDate || now,
          record.submissionDeadline,
        ),
      )
    : null;
  const reviewDaysRemaining =
    record.reviewDeadline && !record.reviewCompletedDate
      ? differenceInCalendarDays(record.reviewDeadline, now)
      : record.reviewCompletedDate
        ? "Completed"
        : null;
  const reassessmentDaysRemaining = record.nextReassessmentDate
    ? differenceInCalendarDays(record.nextReassessmentDate, now)
    : null;
  const expirations = (record.certifications || [])
    .map((item: any) => item.expirationDate)
    .filter(Boolean)
    .map((value: any) => new Date(value))
    .filter((value: Date) => differenceInCalendarDays(value, now) >= 0);
  const earliestCertificationExpirationDate = expirations.length
    ? new Date(Math.min(...expirations.map((value: Date) => value.valueOf())))
    : null;
  return {
    daysOutstanding,
    daysOverdue,
    reviewDaysRemaining,
    reassessmentDaysRemaining,
    earliestCertificationExpirationDate,
    certificationCount: record.certifications?.length || 0,
    nextAction: nextAction(record, daysOverdue),
  };
}

export function certificationExpiration(
  expirationDate: Date | null,
  now = new Date(),
) {
  if (!expirationDate) return "No Expiration Date Provided";
  const days = differenceInCalendarDays(expirationDate, now);
  if (days < 0) return "Expired";
  if (days <= 30) return "Expiring Within 30 Days";
  if (days <= 60) return "Expiring Within 60 Days";
  if (days <= 90) return "Expiring Within 90 Days";
  return "Valid for More Than 90 Days";
}

function nextAction(record: any, daysOverdue: number | null) {
  if (record.status === "Ready to Send") return "Send TPSA";
  if (["Sent", "Awaiting Vendor Submission"].includes(record.status))
    return daysOverdue ? "Follow Up With Vendor" : "Await Vendor Submission";
  if (record.status === "Submitted") return "Review Submission";
  if (record.status === "Clarification Required")
    return "Follow Up on Clarification";
  if (record.status === "Additional Evidence Required")
    return "Request Missing Evidence";
  if (record.status === "Remediation Required") return "Validate Remediation";
  if (record.status === "Pending Risk Acceptance") return "Obtain RAF Approval";
  if (record.verdict === "Pending" && record.cybersecurityReviewCompleted)
    return "Issue Final Verdict";
  if (record.verdict === "Reassessment Required")
    return "Schedule Reassessment";
  return "No Immediate Action";
}
