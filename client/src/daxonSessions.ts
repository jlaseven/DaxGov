export const sessionStoreKey = "daxon-isra-sessions-v1";
export const legacyDraftKey = "daxon-isra-draft-v3";

export type SessionOwner = {
  id: number;
  role?: string;
} | null;

export function sessionStoreKeyFor(owner?: SessionOwner) {
  if (owner?.id != null) return `${sessionStoreKey}:user:${owner.id}`;
  return sessionStoreKey;
}

export function reviseStorageKey(owner?: SessionOwner) {
  if (owner?.id != null) return `daxon-revise:${owner.id}`;
  return "daxon-revise";
}

export type DaxonSession = {
  id: string;
  answers: Record<string, string>;
  index: number;
  riskCount: number;
  input: string;
  paused: boolean;
  savedAt: string;
  createdAt: string;
  sourceAssessmentId?: number;
};

export type DaxonSessionStore = {
  activeId: string;
  sessions: DaxonSession[];
};

export function newSessionId() {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptySession(
  overrides: Partial<DaxonSession> = {},
): DaxonSession {
  const now = new Date().toISOString();
  return {
    id: newSessionId(),
    answers: {},
    index: 0,
    riskCount: 1,
    input: "",
    paused: false,
    savedAt: "",
    createdAt: now,
    ...overrides,
  };
}

export function stringifyAnswers(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, answer]) => [
      key,
      answer == null ? "" : String(answer),
    ]),
  );
}

export function riskCountFromAnswers(answers: Record<string, string>) {
  let count = 1;
  while (answers[`risk.${count - 1}.more`] === "Yes" && count < 100) count += 1;
  const fromKeys = Object.keys(answers).reduce((highest, key) => {
    const match = key.match(/^risk\.(\d+)\./);
    return match ? Math.max(highest, Number(match[1]) + 1) : highest;
  }, 1);
  return Math.max(1, count, fromKeys);
}

export function sessionTitle(session: DaxonSession) {
  const department = session.answers.department?.trim();
  const respondent = session.answers["respondent.name"]?.trim();
  if (department && respondent) return `${department} · ${respondent}`;
  if (department) return department;
  if (respondent) return `${respondent}'s assessment`;
  if (session.sourceAssessmentId) return "Revising a submitted ISRA";
  const answered = Object.values(session.answers).filter((value) =>
    String(value).trim(),
  ).length;
  if (answered)
    return `In progress · ${answered} answer${answered === 1 ? "" : "s"}`;
  return "New session";
}

function asSession(value: unknown): DaxonSession | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const answers = stringifyAnswers(raw.answers);
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : newSessionId(),
    answers,
    index: Number(raw.index) || 0,
    riskCount: Math.max(1, Number(raw.riskCount) || riskCountFromAnswers(answers)),
    input: typeof raw.input === "string" ? raw.input : "",
    paused: Boolean(raw.paused),
    savedAt: typeof raw.savedAt === "string" ? raw.savedAt : "",
    createdAt:
      typeof raw.createdAt === "string" && raw.createdAt
        ? raw.createdAt
        : new Date().toISOString(),
    sourceAssessmentId:
      Number(raw.sourceAssessmentId) > 0
        ? Number(raw.sourceAssessmentId)
        : undefined,
  };
}

function readJson(key: string) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function emptyStore(): DaxonSessionStore {
  const session = emptySession();
  return { activeId: session.id, sessions: [session] };
}

function storeFromParsed(parsed: unknown): DaxonSessionStore | null {
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { sessions?: unknown }).sessions))
    return null;
  const raw = parsed as { activeId?: unknown; sessions: unknown[] };
  const sessions = raw.sessions
    .map(asSession)
    .filter((session: DaxonSession | null): session is DaxonSession =>
      Boolean(session),
    );
  if (!sessions.length) return null;
  const activeId =
    (typeof raw.activeId === "string" &&
      sessions.some((session: DaxonSession) => session.id === raw.activeId) &&
      raw.activeId) ||
    sessions[0].id;
  return { activeId, sessions };
}

export function loadSessionStore(owner?: SessionOwner): DaxonSessionStore {
  const owned = storeFromParsed(readJson(sessionStoreKeyFor(owner)));
  if (owned) return owned;
  if (owner && owner.role !== "Admin") return emptyStore();
  const parsed = storeFromParsed(readJson(sessionStoreKey));
  if (parsed) {
    if (owner?.id != null) {
      writeSessionStore(parsed, owner);
      try {
        localStorage.removeItem(sessionStoreKey);
        localStorage.removeItem(legacyDraftKey);
      } catch {
        /* Private browsing can block localStorage. */
      }
    }
    return parsed;
  }
  const legacy = asSession(readJson(legacyDraftKey));
  if (legacy && (legacy.savedAt || Object.keys(legacy.answers).length)) {
    const session = { ...legacy, id: legacy.id || newSessionId() };
    const store = { activeId: session.id, sessions: [session] };
    if (owner?.id != null) writeSessionStore(store, owner);
    return store;
  }
  return emptyStore();
}

export function writeSessionStore(
  store: DaxonSessionStore,
  owner?: SessionOwner,
) {
  try {
    localStorage.setItem(sessionStoreKeyFor(owner), JSON.stringify(store));
    localStorage.removeItem(legacyDraftKey);
  } catch {
    /* Private browsing can block localStorage. */
  }
}

export function upsertSession(
  store: DaxonSessionStore,
  session: DaxonSession,
): DaxonSessionStore {
  const index = store.sessions.findIndex((item) => item.id === session.id);
  const sessions =
    index >= 0
      ? store.sessions.map((item) => (item.id === session.id ? session : item))
      : [...store.sessions, session];
  return { ...store, sessions };
}

export function removeSession(
  store: DaxonSessionStore,
  id: string,
): DaxonSessionStore {
  const sessions = store.sessions.filter((session) => session.id !== id);
  if (!sessions.length) {
    const session = emptySession();
    return { activeId: session.id, sessions: [session] };
  }
  const activeId =
    store.activeId === id
      ? [...sessions].sort((first, second) =>
          first.createdAt.localeCompare(second.createdAt),
        )[0].id
      : store.activeId;
  return { activeId, sessions };
}

export function sessionFromSubmission(payload: {
  id: number;
  questionnaireResponses?: unknown;
  riskCount?: number;
}) {
  const answers = stringifyAnswers(payload.questionnaireResponses);
  return emptySession({
    answers,
    index: 0,
    riskCount: Math.max(
      1,
      Number(payload.riskCount) || 1,
      riskCountFromAnswers(answers),
    ),
    input: answers["discovery.1.1"] || Object.values(answers)[0] || "",
    paused: false,
    sourceAssessmentId: payload.id,
  });
}

export function sortedSessions(sessions: DaxonSession[]) {
  return [...sessions].sort((first, second) =>
    first.createdAt.localeCompare(second.createdAt),
  );
}
