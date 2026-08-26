import data from "./regulatoryGuideData.json";

export type RegulatoryClause = {
  id: string;
  area: string;
  ref: string;
  title: string;
  level: number;
  summary: string;
  text: string;
  keywords?: string[];
};

export type RegulatoryGuide = {
  title: string;
  source: string;
  legalBasis: string;
  fileName: string;
  areas: string[];
  clauses: RegulatoryClause[];
};

export const regulatoryGuide = data as RegulatoryGuide;

const STOP = new Set(
  "the a an and or of to for in on with that this those these from by as at is are be its their they should must may can about what does say how where when who which under related regarding".split(
    " ",
  ),
);

const SYNONYMS: Record<string, string[]> = {
  board: ["directors", "audit", "committee", "governance"],
  outsourcing: ["vendor", "third-party", "service", "provider"],
  vendor: ["outsourcing", "third-party", "contract"],
  audit: ["auditor", "independence", "examination"],
  security: ["information", "cyber", "isp", "controls"],
  incident: ["response", "breach", "forensic", "crisis"],
  continuity: ["bcp", "disaster", "recovery", "resilience"],
  bcp: ["continuity", "disaster", "recovery"],
  access: ["authentication", "identity", "password", "privileged"],
  encryption: ["cryptograph", "key", "confidential"],
  change: ["patch", "release", "migration"],
  cloud: ["outsourcing", "vendor", "third-party"],
  payment: ["electronic", "e-money", "channel", "banking"],
  malware: ["virus", "threat", "cyber"],
  log: ["monitoring", "detection", "siem"],
};

function tokens(value: string) {
  return [
    ...new Set(
      (value.toLowerCase().match(/[a-z0-9][a-z0-9.-]{1,}/g) || []).filter(
        (word) => !STOP.has(word) && word.length > 1,
      ),
    ),
  ];
}

export function searchClauses(query: string, limit = 5) {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const refs = trimmed.match(/\b\d+(?:\.\d+)+\b|\b\d+\b/g) || [];
  const words = tokens(trimmed);
  const expanded = new Set(words);
  for (const word of words) {
    for (const extra of SYNONYMS[word] || []) expanded.add(extra);
  }
  const scored = regulatoryGuide.clauses.map((clause) => {
    let score = 0;
    const hay = `${clause.ref} ${clause.title} ${clause.summary} ${clause.text} ${(clause.keywords || []).join(" ")}`.toLowerCase();
    for (const ref of refs) {
      if (clause.ref === ref) score += 80;
      else if (clause.ref.startsWith(ref + ".") || ref.startsWith(clause.ref + "."))
        score += 24;
    }
    for (const word of expanded) {
      if (clause.title.toLowerCase().includes(word)) score += 12;
      if (hay.includes(word)) score += 3;
    }
    if (clause.area.toLowerCase().split(/[^a-z]+/).some((part) => expanded.has(part)))
      score += 8;
    return { clause, score };
  });
  return scored
    .filter((item) => item.score > 6)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.clause);
}

export function excerpt(text: string, length = 280) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= length) return clean;
  return `${clean.slice(0, length).trimEnd()}…`;
}
