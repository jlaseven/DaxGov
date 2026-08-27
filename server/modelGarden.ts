import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fetchPublicHttp, jsonReviver } from "./security.js";

export const researchModelIds = ["kimi", "glm", "both"] as const;
export type ResearchModelId = (typeof researchModelIds)[number];
export type ModelGardenPublisherId = "kimi" | "glm";

export const modelGardenModels = {
  kimi: {
    id: "kimi" as const,
    label: "Kimi K2",
    model:
      process.env.MODEL_GARDEN_KIMI_MODEL ||
      "moonshotai/kimi-k2-thinking-maas",
  },
  glm: {
    id: "glm" as const,
    label: "GLM",
    model: process.env.MODEL_GARDEN_GLM_MODEL || "zai-org/glm-5.2-maas",
  },
};

type ServiceAccount = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
  token_uri?: string;
};

type CachedToken = {
  accessToken: string;
  expiresAt: number;
  projectId: string;
};

let cachedToken: CachedToken | null = null;
let cachedTokenPath = "";

export function modelGardenCredentialsPath() {
  return (
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.resolve(process.cwd(), "credentials/credentials.json")
  );
}

export function parseResearchModels(value: unknown): ResearchModelId {
  const text = String(value || "both").trim().toLocaleLowerCase("en");
  if (text === "kimi" || text === "glm" || text === "both") return text;
  throw new Error("Research models must be kimi, glm, or both.");
}

export function publisherIdsFor(models: ResearchModelId): ModelGardenPublisherId[] {
  if (models === "both") return ["glm", "kimi"];
  return [models];
}

export function researchModelLabel(models: ResearchModelId) {
  return publisherIdsFor(models)
    .map((id) => modelGardenModels[id].label)
    .join(" + ");
}

function parseJsonObject(raw: string) {
  const parsed = JSON.parse(raw, jsonReviver);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Model Garden did not return a JSON object.");
  return parsed as Record<string, unknown>;
}

function balancedJsonObjects(text: string) {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escape) escape = false;
      else if (char === "\\") escape = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0)
        objects.push(text.slice(start, index + 1));
    }
  }
  if (depth > 0 && start >= 0)
    objects.push(`${text.slice(start)}${"}".repeat(depth)}`);
  return objects;
}

export function extractJsonObject(text: string) {
  const stripped = String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, " ")
    .replace(/<\/?think>/gi, " ")
    .replace(/```json\s*/gi, "")
    .replace(/```/g, " ")
    .trim();
  const candidates = balancedJsonObjects(stripped);
  const ordered = [...candidates].reverse();
  if (!ordered.length) {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start >= 0 && end > start) ordered.push(stripped.slice(start, end + 1));
  }
  let lastError: Error | null = null;
  for (const candidate of ordered) {
    try {
      return parseJsonObject(candidate);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      try {
        return parseJsonObject(candidate.replace(/,\s*([}\]])/g, "$1"));
      } catch (repaired) {
        lastError =
          repaired instanceof Error ? repaired : lastError;
      }
    }
  }
  if (lastError?.message.includes("JSON object")) throw lastError;
  throw new Error("Model Garden did not return JSON.");
}

export const RESEARCH_BULLET_LIMIT = 3;
export const RESEARCH_BULLET_MIN = 2;
const FINDING_CHAR_LIMIT = 2_000;
const DANGLING_TAIL =
  /\b(?:and|or|the|of|to|for|with|a|an|by|in|on|at|from|into|including|could|would|may|might|that|which|who|its|their)$/i;
const FINDING_LABEL =
  /^(?:[-*•]|\d+[.)]|\[?\s*(?:bullet|finding|item|point)\s*\d+\s*[:.)\]-]*)\s*/i;
const PLACEHOLDER_FINDING =
  /up to \s*\d+\s*short bullets|short bullets|exact shape|json only|low\s*\|\s*medium\s*\|\s*high|businessimpact|replace this|example bullet|^(?:bullet|finding|item|point)\s*\d+\s*$/i;

function stripFindingLabel(value: string) {
  let text = String(value || "").replace(/\s+/g, " ").trim();
  for (let index = 0; index < 3; index += 1) {
    const next = text.replace(FINDING_LABEL, "").trim();
    if (next === text) break;
    text = next;
  }
  return text;
}

function completeSentences(value: string) {
  return (
    String(value || "")
      .match(/[^.?!]+[.?!]+(?:["')\]]*)/g)
      ?.map((part) => part.trim())
      .filter(Boolean) || []
  );
}

export function isIncompleteFinding(value: string) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return true;
  if (/…/.test(text) || /\.{3}$/.test(text)) return true;
  return DANGLING_TAIL.test(text.replace(/["')\]]+$/, ""));
}

export function completeFinding(value: string, maximum = FINDING_CHAR_LIMIT) {
  const raw = stripFindingLabel(String(value || "").replace(/\s+/g, " ").trim());
  const hadEllipsis = /…|\.{3}$/.test(String(value || ""));
  let text = raw
    .replace(/[…]+/g, " ")
    .replace(/\.{3,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || PLACEHOLDER_FINDING.test(text)) return "";
  if (hadEllipsis || DANGLING_TAIL.test(text.replace(/["')\]]+$/, ""))) {
    text = completeSentences(text).join(" ");
  }
  if (!text || isIncompleteFinding(text) || PLACEHOLDER_FINDING.test(text))
    return "";
  if (text.length <= maximum) return text;
  const bounded = text.slice(0, maximum).match(/^(.*[.?!])(?=\s|$)/);
  if (bounded?.[1]?.trim()) return bounded[1].trim();
  return completeSentences(text)[0] || "";
}

export function clipAtBoundary(value: string, maximum = FINDING_CHAR_LIMIT) {
  return completeFinding(value, maximum);
}

export function splitFindingLines(value: string) {
  return String(value || "")
    .split(/\n+/)
    .flatMap((line) => line.split(/(?:^|\s)•\s+/))
    .map((line) => stripFindingLabel(line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")))
    .filter(Boolean);
}

export function sanitizeInventoryField(
  value: string | null | undefined,
  maximum = 20,
) {
  if (value == null) return null;
  const original = String(value).trim();
  if (!original) return null;
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const item of splitFindingLines(original)) {
    const text = completeFinding(item);
    const key = text.toLocaleLowerCase("en");
    if (!text || seen.has(key)) continue;
    seen.add(key);
    unique.push(text);
    if (unique.length === maximum) break;
  }
  if (!unique.length) return null;
  if (unique.length === 1 && !/[•\n]/.test(original)) return unique[0];
  return bulletsFromLines(unique, unique.length);
}

export function linesFromModelField(value: unknown) {
  const items = Array.isArray(value)
    ? value.map((item) => String(item || ""))
    : splitFindingLines(String(value || ""));
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const text = completeFinding(item);
    const key = text.toLocaleLowerCase("en");
    if (!text || isPlaceholderFinding(text) || seen.has(key)) continue;
    seen.add(key);
    lines.push(text);
    if (lines.length === RESEARCH_BULLET_LIMIT) break;
  }
  return lines;
}

export function isPlaceholderFinding(value: string) {
  const text = stripFindingLabel(value);
  if (!text) return true;
  if (text.length < 8) return true;
  if (PLACEHOLDER_FINDING.test(text)) return true;
  if (PLACEHOLDER_FINDING.test(String(value || "").trim())) return true;
  if (/^["'\[]/.test(text) && /bullets|schema|json/i.test(text)) return true;
  return false;
}

function cleanRating(value: unknown) {
  const text = String(value || "").trim();
  if (!text || /\|/.test(text) || PLACEHOLDER_FINDING.test(text)) return null;
  return text;
}

export function draftIsUsable(draft: ModelGardenDraft) {
  const filled = [
    draft.businessImpact.length,
    draft.threat.length,
    draft.vulnerability.length,
  ].filter((count) => count > 0).length;
  const total =
    draft.businessImpact.length +
    draft.threat.length +
    draft.vulnerability.length;
  return filled >= 2 && total >= 3;
}

export function bulletsFromLines(
  lines: string[],
  maximum = RESEARCH_BULLET_LIMIT,
) {
  return lines
    .slice(0, maximum)
    .map((line) => `• ${line}`)
    .join("\n");
}

export function mergeLineLists(
  lists: string[][],
  maximum = RESEARCH_BULLET_LIMIT,
) {
  const merged: string[] = [];
  const seen = new Set<string>();
  const longest = Math.max(0, ...lists.map((list) => list.length));
  for (let index = 0; index < longest && merged.length < maximum; index += 1) {
    for (const list of lists) {
      const text = list[index];
      if (!text) continue;
      const key = text.toLocaleLowerCase("en");
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(text);
      if (merged.length === maximum) break;
    }
  }
  return merged;
}

const ratingRank = new Map([
  ["critical", 4],
  ["very high", 4],
  ["high", 3],
  ["medium", 2],
  ["moderate", 2],
  ["low", 1],
]);

export function pickStrongerRating(values: Array<string | null | undefined>) {
  let selected: string | null = null;
  let selectedRank = -1;
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text) continue;
    const rank = ratingRank.get(text.toLocaleLowerCase("en")) ?? 0;
    if (rank >= selectedRank) {
      selected = text;
      selectedRank = rank;
    }
  }
  return selected;
}

export type ModelGardenDraft = {
  businessImpact: string[];
  threat: string[];
  vulnerability: string[];
  likelihood: string | null;
  impact: string | null;
  riskLevel: string | null;
};

export function draftFromModelJson(value: Record<string, unknown>): ModelGardenDraft {
  return {
    businessImpact: linesFromModelField(value.businessImpact),
    threat: linesFromModelField(value.threat),
    vulnerability: linesFromModelField(value.vulnerability),
    likelihood: cleanRating(value.likelihood),
    impact: cleanRating(value.impact),
    riskLevel: cleanRating(value.riskLevel),
  };
}

export function mergeModelGardenDrafts(drafts: ModelGardenDraft[]): ModelGardenDraft {
  return {
    businessImpact: mergeLineLists(drafts.map((draft) => draft.businessImpact)),
    threat: mergeLineLists(drafts.map((draft) => draft.threat)),
    vulnerability: mergeLineLists(
      drafts.map((draft) => draft.vulnerability),
      RESEARCH_BULLET_LIMIT,
    ),
    likelihood: pickStrongerRating(drafts.map((draft) => draft.likelihood)),
    impact: pickStrongerRating(drafts.map((draft) => draft.impact)),
    riskLevel: pickStrongerRating(drafts.map((draft) => draft.riskLevel)),
  };
}

export const owaspTop10_2025 = [
  ["A01:2025", "Broken Access Control", /access control|privilege|authorization|idor|rbac|ssrf|over-?privileged|admin api|permission/i],
  ["A02:2025", "Security Misconfiguration", /misconfig|default password|exposed|public bucket|open port|overly permissive|hardening|guest account/i],
  ["A03:2025", "Software Supply Chain Failures", /supply chain|dependency|plugin|third-?party|outdated|unpatched|component|library|package|vendor update/i],
  ["A04:2025", "Cryptographic Failures", /encrypt|tls|crypto|plaintext|private key|certificate|vault|password storage/i],
  ["A05:2025", "Injection", /injection|xss|sql|command inject|ldap|template inject/i],
  ["A06:2025", "Insecure Design", /insecure design|business logic|threat model|fail open|missing control/i],
  ["A07:2025", "Authentication Failures", /auth(?:entication|n)?|mfa|password|credential|session|sso|identity|login|break-glass/i],
  ["A08:2025", "Software or Data Integrity Failures", /integrity|unsigned|ci\/cd|deserializ|tamper|pipeline|connected app/i],
  ["A09:2025", "Security Logging and Alerting Failures", /logg(?:ing)?|monitor|alert|audit|detection|visibility|siem/i],
  ["A10:2025", "Mishandling of Exceptional Conditions", /exception|error handling|fail(?:s|ed|ing)? open|crash|timeout|unhandled/i],
] as const;

export type KnownCve = {
  id: string;
  cvss: number | null;
  rating: string | null;
};

export function cvssRating(score: number) {
  if (score >= 9) return "Critical";
  if (score >= 7) return "High";
  if (score >= 4) return "Medium";
  if (score > 0) return "Low";
  return null;
}

export function extractCvesFromText(value: string): KnownCve[] {
  const text = String(value || "");
  const found = new Map<string, KnownCve>();
  const pattern = /CVE-\d{4}-\d{4,7}/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const id = match[0].toUpperCase();
    const window = text.slice(
      Math.max(0, match.index - 100),
      match.index + match[0].length + 140,
    );
    const cvssMatch = window.match(
      /CVSS(?:\s*v?\d+(?:\.\d+)?)?[:\s]*([0-9](?:\.[0-9])?)/i,
    );
    const cvss = cvssMatch ? Number(cvssMatch[1]) : null;
    const valid = cvss != null && Number.isFinite(cvss) && cvss >= 0 && cvss <= 10;
    const previous = found.get(id);
    found.set(id, {
      id,
      cvss: valid ? cvss : previous?.cvss ?? null,
      rating: valid ? cvssRating(cvss as number) : previous?.rating ?? null,
    });
  }
  return [...found.values()];
}

export function formatKnownCves(cves: KnownCve[]) {
  return cves
    .map((cve) =>
      cve.cvss != null
        ? `${cve.id} CVSS ${cve.cvss} ${cve.rating || ""}`.trim()
        : cve.id,
    )
    .join("; ");
}

export function mapVulnerabilityToOwasp(value: string) {
  const text = String(value || "");
  const listed = text.match(/A(\d{2}):202[15]/i);
  if (listed) {
    const code = `A${listed[1]}:2025`;
    const known = owaspTop10_2025.find(([id]) => id === code);
    if (known) return `${known[0]} ${known[1]}`;
  }
  let best: (typeof owaspTop10_2025)[number] | null = null;
  let bestScore = 0;
  for (const row of owaspTop10_2025) {
    const hits = text.match(row[2]);
    const score = hits ? hits.length : 0;
    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }
  const selected = best || owaspTop10_2025[1];
  return `${selected[0]} ${selected[1]}`;
}

function formatCveTag(cve: KnownCve) {
  if (cve.cvss != null)
    return `${cve.id} CVSS ${cve.cvss} ${cve.rating || ""}`.trim();
  return cve.id;
}

export function enrichVulnerabilityLines(lines: string[], knownCves: KnownCve[]) {
  const unused = [...knownCves];
  return lines.slice(0, RESEARCH_BULLET_LIMIT).map((line) => {
    const owasp = mapVulnerabilityToOwasp(line);
    const existingCve = line.match(/CVE-\d{4}-\d{4,7}/i)?.[0]?.toUpperCase();
    let matched: KnownCve | null = null;
    if (existingCve) {
      matched =
        knownCves.find((item) => item.id === existingCve) || {
          id: existingCve,
          cvss: null,
          rating: null,
        };
      const index = unused.findIndex((item) => item.id === existingCve);
      if (index >= 0) unused.splice(index, 1);
    } else {
      matched = unused.shift() || null;
    }
    const finding = line
      .replace(/\s*\((?:OWASP|A0\d)[^)]*\)\s*/gi, " ")
      .replace(/\s*OWASP\s+A0?\d:?202[15][^.;]*/gi, " ")
      .replace(/\s*CVE-\d{4}-\d{4,7}(?:\s*CVSS\s*[0-9.]+)?[^.;]*/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[.;]+$/, "");
    const cveTag = matched ? formatCveTag(matched) : "No public CVE";
    return `${finding} (${owasp}; ${cveTag})`;
  });
}

function readServiceAccount(filePath: string): ServiceAccount {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"), jsonReviver) as ServiceAccount;
  } catch {
    throw new Error(
      `Google Model Garden credentials were not found at ${filePath}.`,
    );
  }
}

function signJwt(credentials: ServiceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: credentials.client_email,
      sub: credentials.client_email,
      aud: credentials.token_uri || "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
      scope: "https://www.googleapis.com/auth/cloud-platform",
    }),
  ).toString("base64url");
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  if (!credentials.private_key)
    throw new Error("Google Model Garden credentials are missing a private key.");
  return `${unsigned}.${signer.sign(credentials.private_key, "base64url")}`;
}

async function accessToken() {
  const filePath = modelGardenCredentialsPath();
  if (
    cachedToken &&
    cachedTokenPath === filePath &&
    cachedToken.expiresAt > Date.now() + 60_000
  )
    return cachedToken;

  const credentials = readServiceAccount(filePath);
  const projectId =
    process.env.GOOGLE_CLOUD_PROJECT || credentials.project_id || "";
  if (!projectId || !credentials.client_email)
    throw new Error("Google Model Garden credentials are incomplete.");

  const tokenUri =
    credentials.token_uri || "https://oauth2.googleapis.com/token";
  const response = await fetchPublicHttp(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signJwt(credentials),
    }),
  });
  const payload = JSON.parse(await response.text(), jsonReviver) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !payload.access_token)
    throw new Error(
      payload.error_description ||
        payload.error ||
        `Google Model Garden login failed with HTTP ${response.status}.`,
    );

  cachedTokenPath = filePath;
  cachedToken = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000,
    projectId,
  };
  return cachedToken;
}

function collectAssistantText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value))
    return value.map(collectAssistantText).filter(Boolean).join("\n");
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return [
    record.content,
    record.text,
    record.reasoning_content,
    record.reasoning,
  ]
    .map(collectAssistantText)
    .filter(Boolean)
    .join("\n");
}

function assistantText(payload: Record<string, unknown>) {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const message = (choices[0] as { message?: Record<string, unknown> } | undefined)
    ?.message;
  return collectAssistantText(message || payload).trim();
}

export type CompleteModelGardenChat = (input: {
  modelId: ModelGardenPublisherId;
  prompt: string;
}) => Promise<string>;

export const completeModelGardenChat: CompleteModelGardenChat = async ({
  modelId,
  prompt,
}) => {
  const token = await accessToken();
  const selected = modelGardenModels[modelId];
  const url = `https://aiplatform.googleapis.com/v1/projects/${token.projectId}/locations/global/endpoints/openapi/chat/completions`;
  const post = async (jsonMode: boolean) => {
    const response = await fetchPublicHttp(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: selected.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: modelId === "kimi" ? 8192 : 4096,
        temperature: 0.1,
        stream: false,
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    const raw = await response.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(raw, jsonReviver) as Record<string, unknown>;
    } catch {
      payload = {};
    }
    return { response, raw, payload };
  };
  let { response, payload } = await post(true);
  if (!response.ok) {
    const error = payload.error as
      | { message?: string }
      | Array<{ error?: { message?: string } }>
      | undefined;
    const message = Array.isArray(error)
      ? error[0]?.error?.message
      : error?.message;
    if (/response_format|json_object/i.test(String(message || ""))) {
      ({ response, payload } = await post(false));
    }
    if (!response.ok) {
      const retryError = payload.error as
        | { message?: string }
        | Array<{ error?: { message?: string } }>
        | undefined;
      const retryMessage = Array.isArray(retryError)
        ? retryError[0]?.error?.message
        : retryError?.message;
      throw new Error(
        retryMessage ||
          message ||
          `${selected.label} returned HTTP ${response.status}.`,
      );
    }
  }
  const text = assistantText(payload);
  if (!text) throw new Error(`${selected.label} returned an empty response.`);
  return text;
};

export const pdaxOrganizationContext = `PDAX (Philippine Digital Asset Exchange) is a crypto investment and digital-asset company operating in the Philippines. It functions as a virtual asset service provider: customers buy, sell, hold, and transfer cryptocurrency; the firm handles wallets and custody, trading, KYC/AML, and fiat on/off-ramps. It is expected to comply with Bangko Sentral ng Pilipinas (BSP) virtual-asset rules, the Anti-Money Laundering Act, and the Data Privacy Act / National Privacy Commission. High-value assets include customer fiat and crypto, private keys, wallet infrastructure, trading systems, identity records, and employee access to production.`;

export const MODEL_JSON_ATTEMPTS = 2;

export function researchRetryPrompt(
  prompt: string,
  modelLabel: string,
  reason: string,
) {
  const context = prompt.length > 3500 ? prompt.slice(-3500) : prompt;
  return `Return JSON only. No markdown and no analysis outside the object.
Keys: businessImpact, threat, vulnerability (each an array of 2 complete sentences), likelihood, impact, riskLevel.
The previous ${modelLabel} reply was unusable (${reason}). Do not copy instructions. Do not truncate findings. Array values must be plain sentences with no numbering or prefixes.

Source context:
${context}`;
}

export function peerReviewPrompt(
  assetName: string,
  assetType: string | null | undefined,
  authorLabel: string,
  draft: ModelGardenDraft,
  internalContext?: {
    daxon?: string | null;
    orca?: string | null;
    web?: string | null;
  },
) {
  const subject = assetType ? `${assetName} (${assetType})` : assetName;
  return `You are checking a ${authorLabel} information-asset draft for PDAX.

Organization context:
${pdaxOrganizationContext}

Asset: ${subject}

Keep two concise, complete findings per list. Never truncate and never use ellipses. Drop instructional placeholders. Map every vulnerability to OWASP Top 10:2025 and add CVE plus CVSS only when the web notes include them. Return JSON only with keys businessImpact, threat, vulnerability (2 findings each, 3 maximum), likelihood, impact, and riskLevel. Array values must be plain sentences with no numbering or prefixes.

Draft to check:
${JSON.stringify(
    {
      businessImpact: draft.businessImpact,
      threat: draft.threat,
      vulnerability: draft.vulnerability,
      likelihood: draft.likelihood,
      impact: draft.impact,
      riskLevel: draft.riskLevel,
    },
    null,
    2,
  )}

Internal Daxon answers:
${String(internalContext?.daxon || "").trim() || "None."}

Internal ORCA risks:
${String(internalContext?.orca || "").trim() || "None."}

Web research:
${String(internalContext?.web || "").trim() || "No public pages were scraped. Rely on internal records and established product risks."}`;
}

export function assetResearchPrompt(
  assetName: string,
  assetType: string | null | undefined,
  initialVulnerabilityResearch: string,
  supportingEvidence: string,
  internalContext?: {
    daxon?: string | null;
    orca?: string | null;
    knownCves?: string | null;
  },
) {
  const subject = assetType ? `${assetName} (${assetType})` : assetName;
  const daxon = String(internalContext?.daxon || "").trim();
  const orca = String(internalContext?.orca || "").trim();
  const knownCves = String(internalContext?.knownCves || "").trim();
  const web =
    String(initialVulnerabilityResearch || "").trim() ||
    String(supportingEvidence || "").trim();
  return `You are writing OCTAVE-style information asset analysis for PDAX.

Organization context:
${pdaxOrganizationContext}

Asset: ${subject}

Return JSON only with these keys:
- businessImpact: ${RESEARCH_BULLET_MIN} to ${RESEARCH_BULLET_LIMIT} complete findings on what fails at PDAX if this asset is disrupted or abused
- threat: ${RESEARCH_BULLET_MIN} to ${RESEARCH_BULLET_LIMIT} complete findings on who or what could attack this asset
- vulnerability: ${RESEARCH_BULLET_MIN} to ${RESEARCH_BULLET_LIMIT} complete findings on weaknesses of this asset. Each must map to OWASP Top 10:2025 (A01–A10) and, when the web notes include one, cite CVE-ID plus CVSS base score and rating (Critical/High/Medium/Low). If no CVE is in the notes, omit the CVE rather than inventing one.
- likelihood: Low, Medium, or High
- impact: Low, Medium, or High
- riskLevel: Low, Medium, High, or Critical

OWASP Top 10:2025: A01 Broken Access Control; A02 Security Misconfiguration; A03 Software Supply Chain Failures; A04 Cryptographic Failures; A05 Injection; A06 Insecure Design; A07 Authentication Failures; A08 Software or Data Integrity Failures; A09 Security Logging and Alerting Failures; A10 Mishandling of Exceptional Conditions.

Rules:
- Keep each finding concise, but it must be a complete thought that makes sense on its own.
- Never truncate a finding. Never use ellipses (... or …). Never cut a word or clause in half.
- Return JSON arrays of plain sentences only. Do not number, title, or prefix the strings.
- Every array value must be a real finding about ${assetName}. Name the asset in each finding.
- If public web research is present, refine it and keep CVE or CVSS detail that is relevant.
- If public web research is missing, write from Daxon answers, ORCA risks, and established risks of this product at a Philippine VASP. Do not refuse and do not output instructions.
- Use internal Daxon answers as the department's description of use, ownership, and controls.
- Use matching ORCA risks as already-identified threats, causes, and impacts. Adapt only what applies to this asset.
- Tie impact to crypto customers, wallets/custody, trading, fiat rails, KYC/AML, BSP, and the Data Privacy Act where that is credible.
- Do not invent vendor incidents or CVE numbers unless the web notes or internal records support them.
- Do not wrap the JSON in markdown.
- Do not copy this prompt. Do not return instructional phrases.

Internal Daxon answers:
${daxon || "No matching Daxon answers were available for this asset."}

Internal ORCA risks:
${orca || "No matching ORCA risks were available for this asset."}

Known CVEs from public research:
${knownCves || "No CVE identifiers were extracted from public pages."}

Initial vulnerability research (scraped first):
${initialVulnerabilityResearch || "No public vulnerability pages were scraped. Use internal records and known product risks."}

Supporting threat and business-impact research:
${supportingEvidence || "No supporting search snippets were available."}

Public web research available: ${web ? "yes" : "no"}`;
}
