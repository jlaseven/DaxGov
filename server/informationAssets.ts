import { createHash } from "node:crypto";
import { z } from "zod";
import {
  assetResearchPrompt,
  bulletsFromLines,
  completeFinding,
  completeModelGardenChat,
  draftFromModelJson,
  draftIsUsable,
  enrichVulnerabilityLines,
  extractCvesFromText,
  extractJsonObject,
  formatKnownCves,
  mergeModelGardenDrafts,
  MODEL_JSON_ATTEMPTS,
  modelGardenModels,
  peerReviewPrompt,
  publisherIdsFor,
  researchModelLabel,
  researchRetryPrompt,
  sanitizeInventoryField,
  type CompleteModelGardenChat,
  type ModelGardenDraft,
  type ModelGardenPublisherId,
  type ResearchModelId,
} from "./modelGarden.js";
import { fetchPublicHttp, readLimitedText } from "./security.js";
import { assetResearchEnabled } from "./features.js";

export const daxonAssetQuestionIds = ["discovery.2.1", "discovery.5.1"];
export const daxonControlsQuestionId = "discovery.8.1";

export const informationAssetUpdateSchema = z.object({
  assetName: z.string().trim().min(1, "Asset name is required").max(500),
  assetType: z.string().trim().max(500).nullable(),
  businessImpact: z.string().trim().max(10_000).nullable(),
  threat: z.string().trim().max(10_000).nullable(),
  vulnerability: z.string().trim().max(10_000).nullable(),
  likelihood: z.string().trim().max(200).nullable(),
  impact: z.string().trim().max(200).nullable(),
  riskLevel: z.string().trim().max(200).nullable(),
  existingControls: z.string().trim().max(10_000).nullable(),
});

export function presentInformationAsset<
  T extends {
    businessImpact?: string | null;
    threat?: string | null;
    vulnerability?: string | null;
    existingControls?: string | null;
  },
>(asset: T): T {
  return {
    ...asset,
    businessImpact: sanitizeInventoryField(asset.businessImpact ?? null),
    threat: sanitizeInventoryField(asset.threat ?? null),
    vulnerability: sanitizeInventoryField(asset.vulnerability ?? null),
    existingControls: sanitizeInventoryField(asset.existingControls ?? null),
  };
}

export function parseDaxonResponses(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(value || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      return parsed as Record<string, string | number | boolean>;
  } catch {
    // Older or malformed questionnaire data is ignored during synchronization.
  }
  return {};
}

function noneToNull(value: string | null | undefined) {
  const text = String(value || "").trim();
  if (
    !text ||
    /^(?:none|n\/?a|not applicable|no information)$/i.test(text)
  )
    return null;
  return text;
}

function normalizeAssetName(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en");
}

function cleanAssetName(value: string) {
  return value
    .normalize("NFKC")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
    .replace(
      /^(?:(?:our|the) department|we)\s+(?:primarily\s+)?(?:manage|manages|use|uses|handle|handles)\s+/i,
      "",
    )
    .replace(/^\s*(?:and|or)\s+/i, "")
    .replace(/[.]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitOutsideParentheses(value: string, separators: string) {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (const char of value) {
    if (char === "(") depth += 1;
    else if (char === ")" && depth > 0) depth -= 1;
    if (depth === 0 && separators.includes(char)) {
      const piece = current.trim();
      if (piece) parts.push(piece);
      current = "";
      continue;
    }
    current += char;
  }
  const piece = current.trim();
  if (piece) parts.push(piece);
  return parts;
}

function splitInventoryAnswer(value: string, splitCommas = false) {
  const text = String(value || "").replaceAll("\r", "").trim();
  if (!text) return [];
  const isNamedList =
    /\n/.test(text) || /(?:^|\n)\s*(?:[-*•]|\d+[.)])\s+/.test(text);
  const lines = isNamedList ? text.split(/\n+/) : [text];
  const parts = lines.flatMap((line) => {
    if (splitCommas) return splitOutsideParentheses(line, ",;•");
    return isNamedList ? [line] : line.split(/[;•]+/);
  });
  return parts
    .map(cleanAssetName)
    .filter(
      (assetName) =>
        assetName &&
        !/^(?:none|n\/?a|not applicable|no information)$/i.test(assetName),
    );
}

export function extractAssetNames(
  responses: Record<string, string | number | boolean>,
) {
  const items = daxonAssetQuestionIds.flatMap((questionId) =>
    splitInventoryAnswer(
      String(responses[questionId] || ""),
      questionId === "discovery.5.1",
    ).map((assetName) => ({
      assetName,
      sourceQuestion: questionId,
    })),
  );

  const unique = new Map<string, (typeof items)[number]>();
  for (const item of items) {
    const key = normalizeAssetName(item.assetName);
    if (key && !unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()];
}

export function sourceAssetKey(assetName: string) {
  return createHash("sha256")
    .update(normalizeAssetName(assetName))
    .digest("hex");
}

export type DaxonInventoryAssessment = {
  id: number;
  department: string;
  departmentKey: string;
  isActive?: boolean;
  importedAt?: Date | string;
  questionnaireResponses?: string | null;
};

export type InventoryCandidate = {
  department: string;
  departmentKey: string;
  sourceAssetKey: string;
  sourceQuestion: string;
  daxonAssessmentId: number;
  assetName: string;
  existingControls: string | null;
};

export function daxonAssessmentsForInventory(
  assessments: DaxonInventoryAssessment[],
) {
  const ranked = [...assessments].sort((left, right) => {
    if (Boolean(left.isActive) !== Boolean(right.isActive))
      return left.isActive ? -1 : 1;
    return (
      new Date(right.importedAt || 0).getTime() -
      new Date(left.importedAt || 0).getTime()
    );
  });
  const selected = new Map<string, DaxonInventoryAssessment>();
  for (const assessment of ranked) {
    if (!selected.has(assessment.departmentKey))
      selected.set(assessment.departmentKey, assessment);
  }
  return [...selected.values()];
}

export function buildDaxonInventoryCandidates(
  assessments: DaxonInventoryAssessment[],
) {
  const candidates = new Map<string, InventoryCandidate>();
  for (const assessment of daxonAssessmentsForInventory(assessments)) {
    const responses = parseDaxonResponses(assessment.questionnaireResponses);
    const existingControls = noneToNull(
      String(responses[daxonControlsQuestionId] || ""),
    );
    for (const item of extractAssetNames(responses)) {
      const assetKey = sourceAssetKey(item.assetName);
      const uniqueKey = `${assessment.departmentKey}:${assetKey}`;
      if (candidates.has(uniqueKey)) continue;
      candidates.set(uniqueKey, {
        department: assessment.department,
        departmentKey: assessment.departmentKey,
        sourceAssetKey: assetKey,
        sourceQuestion: item.sourceQuestion,
        daxonAssessmentId: assessment.id,
        assetName: item.assetName,
        existingControls,
      });
    }
  }
  return candidates;
}

export function planInformationAssetSync(
  existing: Array<{
    id: number;
    departmentKey: string;
    sourceAssetKey: string;
  }>,
  candidates: Map<string, InventoryCandidate>,
) {
  const keep = new Set(candidates.keys());
  const existingKeys = new Set(
    existing.map((asset) => `${asset.departmentKey}:${asset.sourceAssetKey}`),
  );
  return {
    staleIds: existing
      .filter(
        (asset) =>
          !keep.has(`${asset.departmentKey}:${asset.sourceAssetKey}`),
      )
      .map((asset) => asset.id),
    created: [...candidates.keys()].filter((key) => !existingKeys.has(key))
      .length,
    updated: [...candidates.keys()].filter((key) => existingKeys.has(key))
      .length,
  };
}

export async function syncInformationAssetsFromDaxon(prisma: any) {
  const assessments = await prisma.israAssessment.findMany({
    where: { sourceType: "Daxon Questionnaire" },
    select: {
      id: true,
      department: true,
      departmentKey: true,
      isActive: true,
      importedAt: true,
      questionnaireResponses: true,
    },
    orderBy: { importedAt: "desc" },
  });
  const candidates = buildDaxonInventoryCandidates(assessments);
  const existing = await prisma.informationAsset.findMany({
    select: {
      id: true,
      departmentKey: true,
      sourceAssetKey: true,
    },
  });
  const plan = planInformationAssetSync(existing, candidates);
  if (plan.staleIds.length) {
    await prisma.watchItem.deleteMany({
      where: {
        entityType: "information-assets",
        entityId: { in: plan.staleIds.map(String) },
      },
    });
    await prisma.informationAsset.deleteMany({
      where: { id: { in: plan.staleIds } },
    });
  }
  for (const candidate of candidates.values()) {
    await prisma.informationAsset.upsert({
      where: {
        departmentKey_sourceAssetKey: {
          departmentKey: candidate.departmentKey,
          sourceAssetKey: candidate.sourceAssetKey,
        },
      },
      update: {
        department: candidate.department,
        sourceQuestion: candidate.sourceQuestion,
        daxonAssessmentId: candidate.daxonAssessmentId,
        assetName: candidate.assetName,
        existingControls: candidate.existingControls,
      },
      create: candidate,
    });
  }
  return {
    created: plan.created,
    updated: plan.updated,
    removed: plan.staleIds.length,
    discovered: candidates.size,
    total: candidates.size,
  };
}

function decodeHtml(value: string) {
  return value
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/\s+/g, " ")
    .trim();
}

function directResultUrl(value: string) {
  try {
    const url = new URL(value, "https://html.duckduckgo.com");
    return url.searchParams.get("uddg") || url.toString();
  } catch {
    return value;
  }
}

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export function extractWebSearchResults(html: string): WebSearchResult[] {
  const blocks = html.split(/class="[^"]*\bresult\b[^"]*"/i).slice(1);
  const results: WebSearchResult[] = [];
  for (const block of blocks) {
    const link = block.match(
      /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
    );
    const alternateLink = block.match(
      /<a[^>]*href="([^"]+)"[^>]*class="[^"]*result__a[^"]*"[^>]*>([\s\S]*?)<\/a>/i,
    );
    const snippet = block.match(
      /<(?:a|div)[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)>/i,
    );
    const selectedLink = link || alternateLink;
    if (!selectedLink || !snippet) continue;
    const text = decodeHtml(snippet[1]);
    if (!text) continue;
    results.push({
      title: decodeHtml(selectedLink[2]),
      url: directResultUrl(decodeHtml(selectedLink[1])),
      snippet: text,
    });
    if (results.length === 8) break;
  }
  return results;
}

export function resultsToBullets(results: WebSearchResult[], maximum = 3) {
  const bullets: string[] = [];
  const seen = new Set<string>();
  for (const result of results) {
    const text = completeFinding(result.snippet.replace(/^\W+/, "").trim(), 2_000);
    const key = text.toLocaleLowerCase("en");
    if (!text || seen.has(key)) continue;
    seen.add(key);
    bullets.push(`• ${text}`);
    if (bullets.length === maximum) break;
  }
  return bullets.join("\n");
}

const RESEARCH_HEADERS = {
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.8",
  "User-Agent": "Mozilla/5.0 (compatible; CyberGov-Asset-Research/1.0)",
};

async function webSearch(query: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchPublicHttp(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: RESEARCH_HEADERS,
        signal: controller.signal,
      },
    );
    if (!response.ok)
      throw new Error(`Web search returned HTTP ${response.status}.`);
    return extractWebSearchResults(await readLimitedText(response));
  } finally {
    clearTimeout(timeout);
  }
}

export function extractReadablePageText(html: string, maximum = 2_200) {
  const withoutNoise = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const text = decodeHtml(withoutNoise);
  if (text.length <= maximum) return text;
  return `${text.slice(0, maximum).trimEnd()}…`;
}

function shouldScrapeUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return !/(?:^|\.)(?:duckduckgo|google|bing|yahoo|facebook|twitter|linkedin|x)\.com$/.test(
      host,
    );
  } catch {
    return false;
  }
}

export type ScrapedPage = {
  title: string;
  url: string;
  text: string;
};

export async function scrapeResultPages(
  results: WebSearchResult[],
  maximum = 3,
): Promise<ScrapedPage[]> {
  const unique = results.filter(
    (result, index) =>
      shouldScrapeUrl(result.url) &&
      results.findIndex((other) => other.url === result.url) === index,
  );
  const pages: ScrapedPage[] = [];
  for (const result of unique.slice(0, maximum)) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetchPublicHttp(result.url, {
        headers: RESEARCH_HEADERS,
        signal: controller.signal,
      });
      if (!response.ok) continue;
      const text = extractReadablePageText(await readLimitedText(response));
      if (!text) continue;
      pages.push({ title: result.title, url: result.url, text });
    } catch {
      // Keep the search snippet if a page cannot be fetched.
    } finally {
      clearTimeout(timeout);
    }
  }
  return pages;
}

function formatSearchEvidence(groups: Array<[string, WebSearchResult[]]>) {
  return groups
    .map(([label, results]) => {
      const lines = results
        .slice(0, 5)
        .map(
          (result) =>
            `- ${result.title}: ${result.snippet} (${result.url})`,
        );
      return lines.length ? `${label}:\n${lines.join("\n")}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

export function formatInitialVulnerabilityResearch(
  results: WebSearchResult[],
  pages: ScrapedPage[],
) {
  const snippets = formatSearchEvidence([["Vulnerability search snippets", results]]);
  const scraped = pages
    .map((page) => `- ${page.title} (${page.url}): ${page.text}`)
    .join("\n");
  return [snippets, scraped ? `Scraped vulnerability pages:\n${scraped}` : ""]
    .filter(Boolean)
    .join("\n\n");
}

export function vulnerabilitySearchQueries(subject: string) {
  return [
    `${subject} cybersecurity vulnerability CVE weakness exploit`,
    `${subject} cryptocurrency exchange VASP wallet security vulnerability Philippines`,
  ];
}

const DAXON_CONTEXT_LABELS: Record<string, string> = {
  "discovery.1.1": "Main processes",
  "discovery.1.2": "Critical processes",
  "discovery.1.3": "Manual processes",
  "discovery.2.1": "Information assets",
  "discovery.2.2": "Sensitive information handling",
  "discovery.5.1": "Critical systems",
  "discovery.5.2": "System owners and administrators",
  "discovery.5.3": "Third-party hosted systems",
  "discovery.6.1": "Incidents or near misses",
  "discovery.8.1": "Existing controls",
  "discovery.8.2": "Needed control improvements",
  "discovery.8.3": "Department risk concerns",
};

const SAME_DEPARTMENT_QUESTION_IDS = new Set([
  "discovery.1.1",
  "discovery.1.2",
  "discovery.1.3",
  "discovery.2.1",
  "discovery.2.2",
  "discovery.5.1",
  "discovery.5.2",
  "discovery.5.3",
  "discovery.6.1",
  "discovery.8.1",
  "discovery.8.2",
  "discovery.8.3",
]);

const RESEARCH_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "information",
  "management",
  "user",
  "name",
  "owned",
  "department",
  "records",
  "files",
  "system",
  "systems",
  "application",
  "applications",
  "tool",
  "tools",
  "none",
]);

const RESEARCH_ALIASES: Record<string, string[]> = {
  jumpcloud: [
    "directory",
    "sso",
    "mdm",
    "uem",
    "identity",
    "onboarding",
    "offboarding",
    "user management",
  ],
  qualys: ["vapt", "vulnerability", "pentest", "scanning", "assessment"],
  trendmicro: ["endpoint", "malware", "edr", "alert", "monitoring", "quarantine"],
  slack: ["messaging", "chat", "collaboration"],
  google: ["email", "workspace", "collaboration", "identity"],
  workspace: ["email", "collaboration", "identity"],
  nordpass: ["password", "credential", "secrets", "vault"],
  kissflow: ["workflow", "ticket", "process"],
};

const PLACEHOLDER_ANSWER = /this is where we stopped/i;

export type DaxonResearchAssessment = {
  id?: number;
  department: string;
  departmentKey?: string;
  isActive?: boolean;
  respondentName?: string | null;
  questionnaireResponses?: string | null;
  risks?: Array<{
    process?: string | null;
    description?: string | null;
    existingControls?: string | null;
    actionPlan?: string | null;
    inherentRating?: string | null;
    residualRating?: string | null;
  }>;
};

export type OrcaResearchRisk = {
  riskNo: string;
  process: string;
  riskThreat: string;
  cause?: string | null;
  impactPerRisk?: string | null;
  existingKeyControls?: string | null;
  inherentLikelihood?: string | null;
  inherentImpactRating?: string | null;
  residualRiskRemarks?: string | null;
  inherentRiskScore?: number | null;
};

function clipResearchText(value: string, maximum = 2_000) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[…]+/g, " ")
    .replace(/\.{3,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  if (text.length <= maximum) return text;
  const sentence = text.slice(0, maximum).match(/^(.*[.?!])(?=\s|$)/);
  if (sentence?.[1]?.trim()) return sentence[1].trim();
  return text;
}

function usableResearchText(value: unknown) {
  const text = String(value || "").trim();
  if (!text || PLACEHOLDER_ANSWER.test(text) || noneToNull(text) == null)
    return "";
  return text;
}

export function researchTokens(value: string) {
  const unique = new Set<string>();
  for (const match of String(value || "")
    .toLocaleLowerCase("en")
    .match(/[a-z0-9][a-z0-9+.-]{2,}/g) || []) {
    if (RESEARCH_STOPWORDS.has(match) || /^\d+$/.test(match)) continue;
    unique.add(match);
  }
  return [...unique];
}

function expandedResearchTokens(value: string) {
  const tokens = researchTokens(value);
  const expanded = new Set(tokens);
  for (const token of tokens) {
    for (const alias of RESEARCH_ALIASES[token] || []) expanded.add(alias);
  }
  return [...expanded];
}

function textMentionsTokens(value: string, tokens: string[]) {
  const haystack = value.toLocaleLowerCase("en");
  return tokens.some((token) => haystack.includes(token));
}

function scoreResearchText(value: string, tokens: string[]) {
  const haystack = value.toLocaleLowerCase("en");
  let score = 0;
  for (const token of tokens) {
    if (!haystack.includes(token)) continue;
    score += token.length >= 6 ? 3 : 2;
  }
  return score;
}

function daxonQuestionLabel(questionId: string) {
  if (DAXON_CONTEXT_LABELS[questionId]) return DAXON_CONTEXT_LABELS[questionId];
  if (/^risk\.\d+\.description$/.test(questionId)) return "Raised ISRA risk";
  if (/^risk\.\d+\.process$/.test(questionId)) return "Risk process";
  if (/^risk\.\d+\.existingControls$/.test(questionId))
    return "Risk existing controls";
  if (/^risk\.\d+\.actionPlan$/.test(questionId)) return "Risk action plan";
  return questionId;
}

function includeDaxonQuestion(
  questionId: string,
  answer: string,
  sameDepartment: boolean,
  tokens: string[],
) {
  if (/^risk\.\d+\.(description|process|existingControls|actionPlan)$/.test(
    questionId,
  ))
    return sameDepartment || textMentionsTokens(answer, tokens);
  if (sameDepartment && SAME_DEPARTMENT_QUESTION_IDS.has(questionId))
    return true;
  return textMentionsTokens(answer, tokens);
}

export function formatDaxonResearchContext(
  assetName: string,
  assessments: DaxonResearchAssessment[],
  departmentKey?: string | null,
) {
  const tokens = researchTokens(assetName);
  if (!tokens.length) return "";
  const lines: string[] = [];
  const ranked = [...assessments].sort((left, right) => {
    const leftSame =
      Boolean(departmentKey) && left.departmentKey === departmentKey ? 0 : 1;
    const rightSame =
      Boolean(departmentKey) && right.departmentKey === departmentKey ? 0 : 1;
    if (leftSame !== rightSame) return leftSame - rightSame;
    if (Boolean(left.isActive) !== Boolean(right.isActive))
      return left.isActive ? -1 : 1;
    return 0;
  });
  for (const assessment of ranked) {
    const sameDepartment =
      Boolean(departmentKey) && assessment.departmentKey === departmentKey;
    const responses = parseDaxonResponses(assessment.questionnaireResponses);
    const notes: string[] = [];
    for (const [questionId, value] of Object.entries(responses)) {
      const answer = usableResearchText(value);
      if (!answer) continue;
      if (!includeDaxonQuestion(questionId, answer, sameDepartment, tokens))
        continue;
      if (!sameDepartment && !textMentionsTokens(answer, tokens)) continue;
      notes.push(
        `- ${daxonQuestionLabel(questionId)}: ${clipResearchText(answer)}`,
      );
    }
    for (const risk of assessment.risks || []) {
      const description = usableResearchText(risk.description);
      if (!description) continue;
      if (!sameDepartment && !textMentionsTokens(description, tokens)) continue;
      notes.push(
        `- Raised ISRA risk (${risk.inherentRating || "unrated"} inherent / ${risk.residualRating || "unrated"} residual): ${clipResearchText(
          [risk.process, description, risk.existingControls, risk.actionPlan]
            .map(usableResearchText)
            .filter(Boolean)
            .join(" · "),
        )}`,
      );
    }
    if (!notes.length) continue;
    const who = assessment.respondentName
      ? ` · ${assessment.respondentName}`
      : "";
    lines.push(
      `${assessment.department}${who}${sameDepartment ? " (source department)" : ""}:`,
    );
    lines.push(...notes.slice(0, 8));
    if (lines.join("\n").length > 3_500) break;
  }
  return lines.join("\n").slice(0, 3_500);
}

export function formatOrcaResearchContext(
  assetName: string,
  extraText: string,
  risks: OrcaResearchRisk[],
) {
  const tokens = expandedResearchTokens(`${assetName} ${extraText || ""}`);
  if (!tokens.length || !risks.length) return "";
  const ranked = risks
    .map((risk) => {
      const blob = [
        risk.process,
        risk.riskThreat,
        risk.cause,
        risk.impactPerRisk,
        risk.existingKeyControls,
        risk.residualRiskRemarks,
      ]
        .filter(Boolean)
        .join(" ");
      return { risk, score: scoreResearchText(blob, tokens) };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return (right.risk.inherentRiskScore || 0) - (left.risk.inherentRiskScore || 0);
    })
    .slice(0, 5)
    .map(({ risk }) => {
      const impact = usableResearchText(risk.impactPerRisk);
      const cause = usableResearchText(risk.cause);
      const controls = usableResearchText(risk.existingKeyControls);
      return [
        `- ${risk.riskNo} · ${risk.process}: ${clipResearchText(risk.riskThreat, 280)}`,
        cause ? `  Cause: ${clipResearchText(cause, 220)}` : "",
        impact ? `  Business impact: ${clipResearchText(impact, 220)}` : "",
        controls ? `  Existing controls: ${clipResearchText(controls, 180)}` : "",
        risk.inherentLikelihood || risk.inherentImpactRating
          ? `  Ratings: ${[risk.inherentLikelihood, risk.inherentImpactRating].filter(Boolean).join(" / ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    });
  return ranked.join("\n");
}

export async function loadInternalAssetResearchContext(
  prisma: any,
  asset: {
    assetName: string;
    departmentKey?: string | null;
    daxonAssessmentId?: number | null;
  },
) {
  const [assessments, orcaRisks] = await Promise.all([
    prisma.israAssessment.findMany({
      where: { sourceType: "Daxon Questionnaire" },
      select: {
        id: true,
        department: true,
        departmentKey: true,
        isActive: true,
        respondentName: true,
        questionnaireResponses: true,
        risks: {
          select: {
            process: true,
            description: true,
            existingControls: true,
            actionPlan: true,
            inherentRating: true,
            residualRating: true,
          },
        },
      },
    }),
    prisma.orcaRisk.findMany({
      where: { archivedAt: null },
      select: {
        riskNo: true,
        process: true,
        riskThreat: true,
        cause: true,
        impactPerRisk: true,
        existingKeyControls: true,
        inherentLikelihood: true,
        inherentImpactRating: true,
        residualRiskRemarks: true,
        inherentRiskScore: true,
      },
    }),
  ]);
  const daxonContext = formatDaxonResearchContext(
    asset.assetName,
    assessments,
    asset.departmentKey,
  );
  return {
    daxonContext,
    orcaContext: formatOrcaResearchContext(
      asset.assetName,
      daxonContext,
      orcaRisks,
    ),
  };
}

function wait(ms: number) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

export function fallbackDraftFromEvidence(input: {
  assetName: string;
  daxonContext?: string | null;
  orcaContext?: string | null;
  publicResearch?: string | null;
  knownCves?: { id: string; cvss: number | null; rating: string | null }[];
}) {
  const name = String(input.assetName || "This asset").trim();
  const tokens = researchTokens(name);
  const snippets = [input.daxonContext, input.orcaContext, input.publicResearch]
    .flatMap((value) =>
      String(value || "")
        .split(/\n+/)
        .map((line) =>
          completeFinding(usableResearchText(line.replace(/^\s*[-*•]\s*/, ""))),
        ),
    )
    .filter(Boolean);
  const relevant = snippets.filter((line) => textMentionsTokens(line, tokens));
  const picked = (relevant.length ? relevant : snippets).slice(0, 4);
  const cve = input.knownCves?.[0];
  const businessImpact = [
    picked[0] ||
      `${name} unavailability would stop PDAX work that already depends on this system.`,
    picked[1] ||
      `A ${name} incident could delay access recovery, trading support, or KYC operations.`,
  ];
  const threat = [
    picked[2] ||
      `Attackers could abuse ${name} credentials or admin access to reach PDAX staff and customer data.`,
    picked[3] ||
      `A supply-chain or misconfiguration issue in ${name} could persist until monitoring detects it.`,
  ];
  const vulnerability = [
    cve
      ? `${name} has a public vulnerability ${cve.id}${cve.cvss != null ? ` CVSS ${cve.cvss} ${cve.rating || ""}` : ""}.`
      : `${name} may be exposed through weak access, missing agents, or delayed patching.`,
    `Logging and owner reviews for ${name} may not catch joiner-leaver or over-privileged access quickly.`,
  ];
  return {
    businessImpact,
    threat,
    vulnerability,
    likelihood: "Medium",
    impact: "High",
    riskLevel: "High",
  };
}

export type ResearchInformationAssetOptions = {
  models?: ResearchModelId;
  search?: typeof webSearch;
  scrape?: (results: WebSearchResult[]) => Promise<ScrapedPage[]>;
  completeChat?: CompleteModelGardenChat;
  retryDelayMs?: number;
  jsonAttempts?: number;
  daxonContext?: string | null;
  orcaContext?: string | null;
};

async function synthesizeWithModel(
  modelId: "kimi" | "glm",
  prompt: string,
  completeChat: CompleteModelGardenChat,
  options: { jsonAttempts?: number; retryDelayMs?: number } = {},
): Promise<ModelGardenDraft> {
  const attempts = Math.max(
    1,
    options.jsonAttempts ?? (modelId === "kimi" ? 2 : MODEL_JSON_ATTEMPTS),
  );
  const retryDelayMs = options.retryDelayMs ?? 400;
  const label = modelGardenModels[modelId].label;
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const text = await completeChat({
        modelId,
        prompt:
          attempt === 1
            ? prompt
            : researchRetryPrompt(prompt, label, lastError?.message || "unusable reply"),
      });
      const draft = draftFromModelJson(extractJsonObject(text));
      if (!draftIsUsable(draft))
        throw new Error(
          `${label} returned placeholder or empty findings instead of asset analysis.`,
        );
      return draft;
    } catch (reason) {
      lastError =
        reason instanceof Error ? reason : new Error(String(reason));
      if (attempt === attempts) break;
      await wait(retryDelayMs * attempt);
    }
  }
  throw new Error(
    `${label} did not return usable JSON after ${attempts} attempts: ${lastError?.message || "unknown error"}`,
  );
}

function firstPassDraft(
  publishers: ModelGardenPublisherId[],
  settled: PromiseSettledResult<ModelGardenDraft>[],
  modelId: ModelGardenPublisherId,
) {
  const index = publishers.indexOf(modelId);
  const result = index >= 0 ? settled[index] : null;
  if (!result || result.status !== "fulfilled" || !draftIsUsable(result.value))
    return null;
  return result.value;
}

export async function researchInformationAsset(
  assetName: string,
  assetType?: string | null,
  options: ResearchInformationAssetOptions = {},
) {
  if (!assetResearchEnabled())
    throw new Error("Asset web research is disabled.");
  const models = options.models || "both";
  const search = options.search || webSearch;
  const scrape = options.scrape || scrapeResultPages;
  const completeChat = options.completeChat || completeModelGardenChat;
  const publishers = publisherIdsFor(models);
  const subject = assetType ? `${assetName} ${assetType}` : assetName;
  const vulnerabilityGroups = await Promise.all(
    vulnerabilitySearchQueries(subject).map((query) => search(query)),
  );
  const vulnerabilityResults = vulnerabilityGroups.flat();
  const scrapedPages = await scrape(vulnerabilityResults);
  const [threatResults, impactResults] = await Promise.all([
    search(
      `${subject} cyber threat attack account takeover wallet drain Philippines crypto exchange`,
    ),
    search(
      `${subject} business impact outage data breach BSP AML Data Privacy Act Philippines`,
    ),
  ]);
  const initialVulnerabilityResearch = formatInitialVulnerabilityResearch(
    vulnerabilityResults,
    scrapedPages,
  );
  const supportingEvidence = formatSearchEvidence([
    ["Threats", threatResults],
    ["Business impact", impactResults],
  ]);
  const publicResearch = [initialVulnerabilityResearch, supportingEvidence]
    .filter(Boolean)
    .join("\n\n");
  const knownCves = extractCvesFromText(publicResearch);
  const prompt = assetResearchPrompt(
    assetName,
    assetType,
    initialVulnerabilityResearch,
    supportingEvidence,
    {
      daxon: options.daxonContext,
      orca: options.orcaContext,
      knownCves: formatKnownCves(knownCves),
    },
  );
  const retry = {
    jsonAttempts: options.jsonAttempts,
    retryDelayMs: options.retryDelayMs,
  };
  const settled = await Promise.allSettled(
    publishers.map((modelId) =>
      synthesizeWithModel(modelId, prompt, completeChat, {
        jsonAttempts:
          options.jsonAttempts ??
          (modelId === "kimi" && publishers.includes("glm") ? 1 : undefined),
        retryDelayMs: options.retryDelayMs,
      }),
    ),
  );
  const drafts: ModelGardenDraft[] = settled.flatMap((result) =>
    result.status === "fulfilled" && draftIsUsable(result.value)
      ? [result.value]
      : [],
  );
  const used = new Set(
    publishers.filter(
      (modelId, index) =>
        settled[index]?.status === "fulfilled" &&
        draftIsUsable((settled[index] as PromiseFulfilledResult<ModelGardenDraft>).value),
    ),
  );
  if (!publicResearch && publishers.includes("glm") && publishers.includes("kimi")) {
    const glmDraft = firstPassDraft(publishers, settled, "glm");
    const kimiDraft = firstPassDraft(publishers, settled, "kimi");
    const authorId: ModelGardenPublisherId | null = glmDraft
      ? "glm"
      : kimiDraft
        ? "kimi"
        : null;
    const reviewerId: ModelGardenPublisherId | null =
      authorId === "glm" ? "kimi" : authorId === "kimi" ? "glm" : null;
    const authorDraft = authorId === "glm" ? glmDraft : kimiDraft;
    if (authorId && reviewerId && authorDraft && firstPassDraft(publishers, settled, reviewerId)) {
      try {
        const reviewed = await synthesizeWithModel(
          reviewerId,
          peerReviewPrompt(
            assetName,
            assetType,
            modelGardenModels[authorId].label,
            authorDraft,
            {
              daxon: options.daxonContext,
              orca: options.orcaContext,
              web: publicResearch,
            },
          ),
          completeChat,
          retry,
        );
        if (draftIsUsable(reviewed)) {
          drafts.push(reviewed);
          used.add(reviewerId);
        }
      } catch {
        // Keep the first-pass draft when the checker cannot refine it.
      }
    }
  }
  if (!drafts.length) {
    const rescue: ModelGardenPublisherId = publishers.includes("glm")
      ? "kimi"
      : "glm";
    if (!publishers.includes(rescue)) {
      try {
        const rescued = await synthesizeWithModel(
          rescue,
          prompt,
          completeChat,
          retry,
        );
        if (draftIsUsable(rescued)) {
          drafts.push(rescued);
          used.add(rescue);
        }
      } catch {
        // Evidence fallback below still completes the research.
      }
    }
  }
  let usedFallback = false;
  if (!drafts.length) {
    const fallback = fallbackDraftFromEvidence({
      assetName,
      daxonContext: options.daxonContext,
      orcaContext: options.orcaContext,
      publicResearch,
      knownCves,
    });
    if (draftIsUsable(fallback)) {
      drafts.push(fallback);
      usedFallback = true;
    }
  }
  if (!drafts.length) {
    const firstError = settled.find((result) => result.status === "rejected");
    const reason =
      firstError && firstError.status === "rejected"
        ? firstError.reason instanceof Error
          ? firstError.reason.message
          : String(firstError.reason)
        : `${researchModelLabel(models)} returned no usable analysis.`;
    throw new Error(reason);
  }
  const merged = mergeModelGardenDrafts(drafts);
  const businessImpact = sanitizeInventoryField(
    bulletsFromLines(merged.businessImpact),
  );
  const threat = sanitizeInventoryField(bulletsFromLines(merged.threat));
  const vulnerability = sanitizeInventoryField(
    bulletsFromLines(
      enrichVulnerabilityLines(merged.vulnerability, knownCves),
    ),
  );
  if (!businessImpact && !threat && !vulnerability)
    throw new Error(
      `${researchModelLabel(models)} did not return usable impact, threat, or vulnerability findings.`,
    );
  const sources = [
    ...scrapedPages.map(({ title, url }) => ({ title, url })),
    ...vulnerabilityResults,
    ...threatResults,
    ...impactResults,
  ]
    .map(({ title, url }) => ({ title, url }))
    .filter(
      (item, index, items) =>
        item.url &&
        items.findIndex((other) => other.url === item.url) === index,
    )
    .slice(0, 15);
  return {
    businessImpact,
    threat,
    vulnerability,
    ...(merged.likelihood ? { likelihood: merged.likelihood } : {}),
    ...(merged.impact ? { impact: merged.impact } : {}),
    ...(merged.riskLevel ? { riskLevel: merged.riskLevel } : {}),
    researchSources: JSON.stringify({
      models: publishers.filter((modelId) => used.has(modelId)),
      organization: "PDAX",
      daxon: Boolean(String(options.daxonContext || "").trim()),
      orca: Boolean(String(options.orcaContext || "").trim()),
      fallback: usedFallback,
      peerReview: Boolean(!publicResearch && used.size > 1),
      sources,
    }),
  };
}
