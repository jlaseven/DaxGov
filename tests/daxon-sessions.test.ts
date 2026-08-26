import { beforeEach, describe, expect, it } from "vitest";
import {
  emptySession,
  legacyDraftKey,
  loadSessionStore,
  removeSession,
  riskCountFromAnswers,
  sessionFromSubmission,
  sessionStoreKey,
  sessionStoreKeyFor,
  sessionTitle,
  stringifyAnswers,
  upsertSession,
  writeSessionStore,
} from "../client/src/daxonSessions";

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: (key: string) => {
        memory.delete(key);
      },
    },
  });
});

describe("Daxon saved sessions", () => {
  it("names a session from department and respondent answers", () => {
    expect(
      sessionTitle(
        emptySession({
          answers: {
            department: "Retail Banking",
            "respondent.name": "Ana Cruz",
          },
        }),
      ),
    ).toBe("Retail Banking · Ana Cruz");
    expect(sessionTitle(emptySession())).toBe("New session");
  });

  it("migrates a legacy single draft into a session store", () => {
    memory.set(
      legacyDraftKey,
      JSON.stringify({
        answers: { "discovery.1.1": "Payments" },
        index: 4,
        riskCount: 1,
        input: "typed",
        paused: true,
        savedAt: "2026-08-25T08:00:00.000Z",
      }),
    );
    const store = loadSessionStore();
    expect(store.sessions).toHaveLength(1);
    expect(store.sessions[0]).toMatchObject({
      answers: { "discovery.1.1": "Payments" },
      index: 4,
      input: "typed",
      paused: true,
    });
  });

  it("keeps multiple paused sessions and restores the earliest after delete", () => {
    const first = emptySession({
      createdAt: "2026-08-25T01:00:00.000Z",
      answers: { department: "First" },
      paused: true,
    });
    const second = emptySession({
      createdAt: "2026-08-25T02:00:00.000Z",
      answers: { department: "Second" },
      paused: true,
    });
    let store = { activeId: second.id, sessions: [first, second] };
    store = upsertSession(store, {
      ...second,
      answers: { department: "Second updated" },
    });
    expect(store.sessions).toHaveLength(2);
    store = removeSession(store, second.id);
    expect(store.activeId).toBe(first.id);
    expect(store.sessions.map((session) => session.answers.department)).toEqual(
      ["First"],
    );
    writeSessionStore(store);
    expect(JSON.parse(memory.get(sessionStoreKey) || "{}").activeId).toBe(
      first.id,
    );
  });

  it("builds a revision session from a submitted questionnaire", () => {
    const session = sessionFromSubmission({
      id: 42,
      riskCount: 2,
      questionnaireResponses: {
        department: "Treasury",
        "risk.0.more": "Yes",
        "risk.1.more": "No",
      },
    });
    expect(session.sourceAssessmentId).toBe(42);
    expect(session.index).toBe(0);
    expect(riskCountFromAnswers(session.answers)).toBe(2);
    expect(stringifyAnswers({ department: 12, skipped: null }).department).toBe(
      "12",
    );
  });

  it("keeps ISRA save progress private to each account", () => {
    const adminDraft = emptySession({
      answers: { department: "Admin department", "respondent.name": "Admin" },
      paused: true,
    });
    writeSessionStore(
      { activeId: adminDraft.id, sessions: [adminDraft] },
      { id: 1, role: "Admin" },
    );
    const userStore = loadSessionStore({ id: 2, role: "User" });
    expect(
      userStore.sessions.some(
        (session) => session.answers.department === "Admin department",
      ),
    ).toBe(false);
    expect(sessionStoreKeyFor({ id: 1 })).not.toBe(sessionStoreKeyFor({ id: 2 }));
    expect(sessionStoreKeyFor({ id: 1 })).toBe(`${sessionStoreKey}:user:1`);
  });

  it("lets an Admin claim the old shared draft once", () => {
    const shared = emptySession({
      answers: { department: "Shared legacy" },
      paused: true,
    });
    memory.set(
      sessionStoreKey,
      JSON.stringify({ activeId: shared.id, sessions: [shared] }),
    );
    const adminStore = loadSessionStore({ id: 1, role: "Admin" });
    expect(adminStore.sessions[0].answers.department).toBe("Shared legacy");
    expect(memory.get(sessionStoreKey)).toBeUndefined();
    const userStore = loadSessionStore({ id: 2, role: "User" });
    expect(
      userStore.sessions.some(
        (session) => session.answers.department === "Shared legacy",
      ),
    ).toBe(false);
  });
});
