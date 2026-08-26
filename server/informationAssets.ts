import { createHash } from "node:crypto";
import { z } from "zod";
import {
  assetResearchPrompt,
  bulletsFromLines,
  completeModelGardenChat,
  draftFromModelJson,
  extractJsonObject,
  mergeModelGardenDrafts,
  publisherIdsFor,
  researchModelLabel,
  type CompleteModelGardenChat,
  type ModelGardenDraft,
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

function splitInventoryAnswer(value: string) {
  const text = String(value || "").replaceAll("\r", "").trim();
  if (!text) return [];
  const isNamedList =
    /\n/.test(text) || /(?:^|\n)\s*(?:[-*•]|\d+[.)])\s+/.test(text);
  const parts = isNamedList ? text.split(/\n+/) : text.split(/[;•]+/);
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
    splitInventoryAnswer(String(responses[questionId] || "")).map(
      (assetName) => ({
        assetName,
        sourceQuestion: questionId,
      }),
    ),
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

export function resultsToBullets(results: WebSearchResult[], maximum = 5) {
  const bullets: string[] = [];
  const seen = new Set<string>();
  for (const result of results) {
    let text = result.snippet.replace(/^\W+/, "").trim();
    if (text.length > 220) text = `${text.slice(0, 217).trimEnd()}…`;
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

export type ResearchInformationAssetOptions = {
  models?: ResearchModelId;
  search?: typeof webSearch;
  scrape?: (results: WebSearchResult[]) => Promise<ScrapedPage[]>;
  completeChat?: CompleteModelGardenChat;
};

async function synthesizeWithModel(
  modelId: "kimi" | "glm",
  prompt: string,
  completeChat: CompleteModelGardenChat,
): Promise<ModelGardenDraft> {
  const text = await completeChat({ modelId, prompt });
  return draftFromModelJson(extractJsonObject(text));
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
  const prompt = assetResearchPrompt(
    assetName,
    assetType,
    initialVulnerabilityResearch,
    supportingEvidence,
  );
  const settled = await Promise.allSettled(
    publishers.map((modelId) =>
      synthesizeWithModel(modelId, prompt, completeChat),
    ),
  );
  const drafts = settled.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
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
  const businessImpact = bulletsFromLines(merged.businessImpact);
  const threat = bulletsFromLines(merged.threat);
  const vulnerability = bulletsFromLines(merged.vulnerability);
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
  const used = publishers.filter(
    (_, index) => settled[index]?.status === "fulfilled",
  );
  return {
    businessImpact,
    threat,
    vulnerability,
    ...(merged.likelihood ? { likelihood: merged.likelihood } : {}),
    ...(merged.impact ? { impact: merged.impact } : {}),
    ...(merged.riskLevel ? { riskLevel: merged.riskLevel } : {}),
    researchSources: JSON.stringify({
      models: used,
      organization: "PDAX",
      sources,
    }),
  };
}
