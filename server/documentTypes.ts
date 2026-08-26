export const DOCUMENT_TYPES = [
  "Procedure",
  "Policy",
  "Framework",
  "Other",
] as const;

export const DOCUMENT_STATUSES = [
  "Updated",
  "Outdated",
  "Currently Updating",
  "Non-existent",
  "For Decommissioning",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export type DocumentStatusSlice = { name: string; value: number };

const TYPE_PATTERNS: Array<{ type: Exclude<DocumentType, "Other">; pattern: RegExp }> =
  [
    { type: "Framework", pattern: /\bframeworks?\b/gi },
    { type: "Procedure", pattern: /\bstandard operating procedures?\b/gi },
    { type: "Procedure", pattern: /\bprocedures?\b/gi },
    { type: "Procedure", pattern: /\bsops?\b/gi },
    { type: "Policy", pattern: /\bpolicies\b/gi },
    { type: "Policy", pattern: /\bpolicy\b/gi },
  ];

export function documentTypeFromName(name: string): DocumentType {
  const matches: Array<{ index: number; type: Exclude<DocumentType, "Other"> }> =
    [];
  for (const { type, pattern } of TYPE_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of String(name || "").matchAll(pattern))
      matches.push({ index: match.index ?? -1, type });
  }
  if (!matches.length) return "Other";
  matches.sort((first, second) => first.index - second.index);
  return matches[matches.length - 1].type;
}

export function documentStatusSlices(
  docs: Array<{ status: string }>,
): DocumentStatusSlice[] {
  const counts = new Map<string, number>();
  for (const status of DOCUMENT_STATUSES) counts.set(status, 0);
  for (const doc of docs) {
    const status = String(doc.status || "").trim() || "Unspecified";
    counts.set(status, (counts.get(status) || 0) + 1);
  }
  const known = DOCUMENT_STATUSES.map((name) => ({
    name,
    value: counts.get(name) || 0,
  })).filter((item) => item.value > 0);
  const extra = [...counts.entries()]
    .filter(
      ([name]) =>
        !(DOCUMENT_STATUSES as readonly string[]).includes(name) &&
        (counts.get(name) || 0) > 0,
    )
    .map(([name, value]) => ({ name, value }));
  return [...known, ...extra];
}

export function documentStatusPies(
  docs: Array<{ documentName: string; status: string }>,
) {
  const grouped: Record<DocumentType, typeof docs> = {
    Procedure: [],
    Policy: [],
    Framework: [],
    Other: [],
  };
  for (const doc of docs) grouped[documentTypeFromName(doc.documentName)].push(doc);
  return {
    overall: documentStatusSlices(docs),
    procedure: documentStatusSlices(grouped.Procedure),
    policy: documentStatusSlices(grouped.Policy),
    framework: documentStatusSlices(grouped.Framework),
    other: documentStatusSlices(grouped.Other),
    counts: {
      procedure: grouped.Procedure.length,
      policy: grouped.Policy.length,
      framework: grouped.Framework.length,
      other: grouped.Other.length,
    },
  };
}
