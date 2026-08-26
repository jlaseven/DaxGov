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
  if (models === "both") return ["kimi", "glm"];
  return [models];
}

export function researchModelLabel(models: ResearchModelId) {
  return publisherIdsFor(models)
    .map((id) => modelGardenModels[id].label)
    .join(" + ");
}

export function extractJsonObject(text: string) {
  const stripped = String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, " ")
    .replace(/```json\s*/gi, "")
    .replace(/```/g, " ")
    .trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start)
    throw new Error("Model Garden did not return JSON.");
  const parsed = JSON.parse(stripped.slice(start, end + 1), jsonReviver);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Model Garden did not return a JSON object.");
  return parsed as Record<string, unknown>;
}

export function linesFromModelField(value: unknown) {
  const items = Array.isArray(value)
    ? value.map((item) => String(item || ""))
    : String(value || "").split(/\n+/);
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    let text = item.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim();
    if (text.length > 220) text = `${text.slice(0, 217).trimEnd()}…`;
    const key = text.toLocaleLowerCase("en");
    if (!text || seen.has(key)) continue;
    seen.add(key);
    lines.push(text);
  }
  return lines;
}

export function bulletsFromLines(lines: string[], maximum = 5) {
  return lines
    .slice(0, maximum)
    .map((line) => `• ${line}`)
    .join("\n");
}

export function mergeLineLists(lists: string[][], maximum = 5) {
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
    likelihood: String(value.likelihood || "").trim() || null,
    impact: String(value.impact || "").trim() || null,
    riskLevel: String(value.riskLevel || "").trim() || null,
  };
}

export function mergeModelGardenDrafts(drafts: ModelGardenDraft[]): ModelGardenDraft {
  return {
    businessImpact: mergeLineLists(drafts.map((draft) => draft.businessImpact)),
    threat: mergeLineLists(drafts.map((draft) => draft.threat)),
    vulnerability: mergeLineLists(drafts.map((draft) => draft.vulnerability)),
    likelihood: pickStrongerRating(drafts.map((draft) => draft.likelihood)),
    impact: pickStrongerRating(drafts.map((draft) => draft.impact)),
    riskLevel: pickStrongerRating(drafts.map((draft) => draft.riskLevel)),
  };
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

function assistantText(payload: Record<string, unknown>) {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const message = (choices[0] as { message?: Record<string, unknown> } | undefined)
    ?.message;
  return String(
    message?.content || message?.reasoning_content || "",
  ).trim();
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
  const response = await fetchPublicHttp(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: selected.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2048,
      temperature: 0.2,
      stream: false,
    }),
  });
  const raw = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(raw, jsonReviver) as Record<string, unknown>;
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const error = payload.error as
      | { message?: string }
      | Array<{ error?: { message?: string } }>
      | undefined;
    const message = Array.isArray(error)
      ? error[0]?.error?.message
      : error?.message;
    throw new Error(
      message || `${selected.label} returned HTTP ${response.status}.`,
    );
  }
  const text = assistantText(payload);
  if (!text) throw new Error(`${selected.label} returned an empty response.`);
  return text;
};

export const pdaxOrganizationContext = `PDAX (Philippine Digital Asset Exchange) is a crypto investment and digital-asset company operating in the Philippines. It functions as a virtual asset service provider: customers buy, sell, hold, and transfer cryptocurrency; the firm handles wallets and custody, trading, KYC/AML, and fiat on/off-ramps. It is expected to comply with Bangko Sentral ng Pilipinas (BSP) virtual-asset rules, the Anti-Money Laundering Act, and the Data Privacy Act / National Privacy Commission. High-value assets include customer fiat and crypto, private keys, wallet infrastructure, trading systems, identity records, and employee access to production.`;

export function assetResearchPrompt(
  assetName: string,
  assetType: string | null | undefined,
  initialVulnerabilityResearch: string,
  supportingEvidence: string,
) {
  const subject = assetType ? `${assetName} (${assetType})` : assetName;
  return `You are refining initial web research for OCTAVE-style information asset analysis.

Organization context:
${pdaxOrganizationContext}

Asset: ${subject}

The vulnerability findings below were scraped from public web sources first. Refine that initial research. Do not ignore it, and do not replace it with generic boilerplate. Rewrite it so it is specific to how this asset would be used at PDAX in the Philippines.

Return JSON only, with this exact shape:
{
  "businessImpact": ["up to 5 short bullets"],
  "threat": ["up to 5 short bullets"],
  "vulnerability": ["up to 5 short bullets"],
  "likelihood": "Low | Medium | High",
  "impact": "Low | Medium | High",
  "riskLevel": "Low | Medium | High | Critical"
}

Rules:
- Vulnerability bullets must come from the scraped initial research, tightened and made PDAX-relevant.
- Tie impact to crypto customers, wallets/custody, trading, fiat rails, KYC/AML, BSP, and the Data Privacy Act where that is credible.
- Prefer Philippine VASP / crypto-exchange consequences over generic global SaaS language.
- Do not invent vendor-specific incidents unless the scraped research supports them.
- Write concise professional bullets, not paragraphs.
- Do not wrap the JSON in markdown.

Initial vulnerability research (scraped first):
${initialVulnerabilityResearch || "No vulnerability pages or snippets were scraped. Infer only tightly from the asset name and PDAX's crypto-exchange role."}

Supporting threat and business-impact research:
${supportingEvidence || "No supporting search snippets were available."}`;
}
