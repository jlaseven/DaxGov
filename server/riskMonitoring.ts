const KRI_MONTH_KEYS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;

export const MONITORING_FREQUENCIES = [
  "Monthly",
  "Quarterly",
  "EventDriven",
  "NotApplicable",
] as const;

export const KRI_UNITS = [
  "Percentage",
  "Count",
  "Days",
  "Hours",
  "Currency",
  "Score",
  "Custom",
] as const;

export const THRESHOLD_MODES = [
  "HIGHER_IS_BETTER",
  "LOWER_IS_BETTER",
  "MANUAL",
] as const;

export const KRI_FREQUENCIES = ["MONTHLY", "QUARTERLY", "EVENT_DRIVEN"] as const;

export const REVIEW_DECISIONS = [
  "NO_CHANGE",
  "UPDATE_LIKELIHOOD",
  "UPDATE_IMPACT",
  "UPDATE_RISK_RATING",
  "CREATE_ACTION",
  "UPDATE_TREATMENT",
  "ESCALATE",
  "RISK_ACCEPTANCE",
] as const;

export type MonitoringStatus =
  | "Not Assessed"
  | "Not Required"
  | "Unmapped"
  | "Partially Covered"
  | "Covered"
  | "Review Required";

export type RagStatus = "Good" | "Warning" | "Breached";

export type SubmissionState =
  | "NOT_DUE"
  | "DUE"
  | "SUBMITTED"
  | "OVERDUE"
  | "BREACHED"
  | "REVIEW_REQUIRED";

export type ThresholdConfig = {
  mode: string;
  goodMin?: number | null;
  goodMax?: number | null;
  warningMin?: number | null;
  warningMax?: number | null;
  breachMin?: number | null;
  breachMax?: number | null;
};

export type MappedKriInput = {
  archivedAt?: Date | string | null;
  owner?: string | null;
  frequency?: string | null;
  hasStructuredThreshold?: boolean;
  thresholdMode?: string | null;
  good?: string | null;
  warning?: string | null;
  breached?: string | null;
};

export function monthKey(month: number) {
  return KRI_MONTH_KEYS[month - 1] ?? null;
}

export function getCurrentKriPeriod(now = new Date()) {
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function previousMonthlyPeriod(year: number, month: number) {
  if (month <= 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function bound(min?: number | null, max?: number | null) {
  const hasMin = min != null && Number.isFinite(min);
  const hasMax = max != null && Number.isFinite(max);
  if (!hasMin && !hasMax) return null;
  if (hasMin && hasMax && (min as number) > (max as number)) {
    throw new Error("Threshold minimum cannot be greater than maximum.");
  }
  return {
    min: hasMin ? (min as number) : Number.NEGATIVE_INFINITY,
    max: hasMax ? (max as number) : Number.POSITIVE_INFINITY,
  };
}

function inBand(
  value: number,
  min?: number | null,
  max?: number | null,
) {
  const range = bound(min, max);
  if (!range) return false;
  return value >= range.min && value <= range.max;
}

function overlaps(
  aMin?: number | null,
  aMax?: number | null,
  bMin?: number | null,
  bMax?: number | null,
) {
  const a = bound(aMin, aMax);
  const b = bound(bMin, bMax);
  if (!a || !b) return false;
  return a.min <= b.max && b.min <= a.max;
}

export function validateThreshold(config: ThresholdConfig) {
  if (!THRESHOLD_MODES.includes(config.mode as (typeof THRESHOLD_MODES)[number])) {
    throw new Error("Unknown threshold mode.");
  }
  if (config.mode === "MANUAL") return;
  const bands = [
    ["Good", config.goodMin, config.goodMax],
    ["Warning", config.warningMin, config.warningMax],
    ["Breached", config.breachMin, config.breachMax],
  ] as const;
  for (const [label, min, max] of bands) {
    try {
      bound(min, max);
    } catch {
      throw new Error(`${label} threshold minimum cannot be greater than maximum.`);
    }
  }
  if (overlaps(config.goodMin, config.goodMax, config.warningMin, config.warningMax)) {
    throw new Error("Good and Warning threshold bands overlap.");
  }
  if (overlaps(config.goodMin, config.goodMax, config.breachMin, config.breachMax)) {
    throw new Error("Good and Breached threshold bands overlap.");
  }
  if (
    overlaps(config.warningMin, config.warningMax, config.breachMin, config.breachMax)
  ) {
    throw new Error("Warning and Breached threshold bands overlap.");
  }
  const defined = bands.filter(([, min, max]) => bound(min, max));
  if (defined.length < 2) {
    throw new Error("Define at least two numeric threshold bands.");
  }
}

export function evaluateKriResult(
  config: ThresholdConfig | null | undefined,
  actualValue: number | null | undefined,
): RagStatus | null {
  if (actualValue == null || !Number.isFinite(actualValue)) return null;
  if (!config || config.mode === "MANUAL") return null;
  validateThreshold(config);
  const matches: RagStatus[] = [];
  if (inBand(actualValue, config.goodMin, config.goodMax)) matches.push("Good");
  if (inBand(actualValue, config.warningMin, config.warningMax))
    matches.push("Warning");
  if (inBand(actualValue, config.breachMin, config.breachMax))
    matches.push("Breached");
  if (matches.length !== 1) {
    throw new Error("Actual result does not fall into exactly one threshold band.");
  }
  return matches[0];
}

export function hasUsableThreshold(kri: MappedKriInput) {
  if (kri.hasStructuredThreshold && kri.thresholdMode !== "MANUAL") return true;
  return Boolean(
    String(kri.good || "").trim() ||
      String(kri.warning || "").trim() ||
      String(kri.breached || "").trim(),
  );
}

function isActiveMapped(kri: MappedKriInput) {
  return !kri.archivedAt;
}

function isIncompleteMapped(kri: MappedKriInput) {
  if (!isActiveMapped(kri)) return true;
  if (!hasUsableThreshold(kri)) return true;
  if (!String(kri.owner || "").trim()) return true;
  if (!String(kri.frequency || "").trim()) return true;
  return false;
}

export function getOrcaMonitoringStatus(input: {
  kriMonitoringRequired: boolean | null | undefined;
  mappedKris: MappedKriInput[];
  openReviewCount: number;
}): MonitoringStatus {
  if (input.kriMonitoringRequired == null) return "Not Assessed";
  if (input.kriMonitoringRequired === false) return "Not Required";
  const active = input.mappedKris.filter(isActiveMapped);
  if (active.length === 0) return "Unmapped";
  if (input.openReviewCount > 0) return "Review Required";
  if (active.some(isIncompleteMapped)) return "Partially Covered";
  return "Covered";
}

export function residualBand(
  score?: number | null,
): "Critical" | "High" | "Medium" | "Low" | "Unrated" {
  if (score == null || !Number.isFinite(score)) return "Unrated";
  if (score >= 15) return "Critical";
  if (score >= 10) return "High";
  if (score >= 5) return "Medium";
  return "Low";
}

export function getKriSubmissionStatus(input: {
  frequency?: string | null;
  periodYear: number;
  periodMonth: number;
  now?: Date;
  status?: string | null;
  hasSubmission: boolean;
  openReview: boolean;
}): SubmissionState {
  const now = input.now || new Date();
  const current = getCurrentKriPeriod(now);
  const freq = input.frequency || "MONTHLY";
  if (freq === "EVENT_DRIVEN" && !input.hasSubmission) return "NOT_DUE";
  const periodIndex = input.periodYear * 12 + input.periodMonth;
  const currentIndex = current.year * 12 + current.month;
  if (periodIndex > currentIndex) return "NOT_DUE";
  if (!input.hasSubmission) {
    return periodIndex < currentIndex ? "OVERDUE" : "DUE";
  }
  if (input.status === "Breached" && input.openReview) return "REVIEW_REQUIRED";
  if (input.status === "Breached") return "BREACHED";
  return "SUBMITTED";
}

export function coveragePercent(input: {
  monitoringRequired: number;
  covered: number;
  reviewRequired: number;
}) {
  if (!input.monitoringRequired) return 0;
  return (
    ((input.covered + input.reviewRequired) / input.monitoringRequired) * 100
  );
}

export function monitoringEffectivenessLabel(score: number) {
  if (score <= 20) return "Critical";
  if (score <= 40) return "Weak";
  if (score <= 60) return "Watch";
  if (score <= 80) return "Good";
  return "Strong";
}

export function calculateMonitoringEffectiveness(input: {
  coveragePercent: number;
  onTimeSubmissionPercent: number;
  resolvedReviewPercent: number;
  criticalCoveragePercent: number;
}) {
  const score =
    clampPercent(input.coveragePercent) * 0.4 +
    clampPercent(input.onTimeSubmissionPercent) * 0.25 +
    clampPercent(input.resolvedReviewPercent) * 0.2 +
    clampPercent(input.criticalCoveragePercent) * 0.15;
  const rounded = Math.round(score * 10) / 10;
  return {
    score: rounded,
    label: monitoringEffectivenessLabel(rounded),
  };
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function managementAttention(input: {
  monitoringStatus: MonitoringStatus;
  latestKriStatus?: string | null;
  residualBand: ReturnType<typeof residualBand>;
  repeatedBreach?: boolean;
}) {
  if (input.monitoringStatus === "Unmapped") return "Unmonitored Exposure";
  if (
    input.latestKriStatus === "Breached" &&
    (input.residualBand === "High" || input.residualBand === "Critical")
  ) {
    return "Management Attention";
  }
  if (input.repeatedBreach) return "Management Attention";
  if (
    input.latestKriStatus === "Warning" ||
    input.monitoringStatus === "Partially Covered"
  ) {
    return "Watch";
  }
  if (
    input.monitoringStatus === "Covered" &&
    (input.latestKriStatus === "Good" || !input.latestKriStatus)
  ) {
    return "Normal";
  }
  if (input.monitoringStatus === "Review Required") return "Management Attention";
  return "Watch";
}

export function monthResultField(month: number) {
  const key = monthKey(month);
  return key ? `${key}Result` : null;
}

export function monthRemarksField(month: number) {
  const key = monthKey(month);
  return key ? `${key}Remarks` : null;
}
