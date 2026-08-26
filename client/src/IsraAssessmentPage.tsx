import {
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "./api";
import { useAuth } from "./auth";
import { DepartmentsManager } from "./DepartmentsManager";
import {
  emptySession,
  loadSessionStore,
  removeSession,
  reviseStorageKey,
  sessionFromSubmission,
  sessionTitle,
  sortedSessions,
  upsertSession,
  writeSessionStore,
  type DaxonSession,
  type DaxonSessionStore,
} from "./daxonSessions";
import {
  buildDaxonQuestions,
  buildDaxonSubmission,
  canonicalDepartmentName,
  listedItemsFromAnswer,
  mergeSystemOwners,
  parseDaxonList,
  procedureGuides,
  serializeDaxonList,
  serializeSystemOwners,
  type DaxonQuestion,
  type SystemOwnerRow,
  validateDaxonAnswer,
} from "./israQuestionnaire";

type RiskDescriptionParts = {
  event: string;
  cause: string;
  impact: string;
};

const emptyRiskDescription: RiskDescriptionParts = {
  event: "",
  cause: "",
  impact: "",
};

function parseRiskDescription(value: string): RiskDescriptionParts {
  const match = value.match(
    /^Risk of\s*([\s\S]*?)\s*Due to\s*([\s\S]*?)\s*Resulting in\s*([\s\S]*)$/,
  );
  if (!match) return emptyRiskDescription;
  return {
    event: match[1].trim(),
    cause: match[2].trim(),
    impact: match[3].trim(),
  };
}

function assembleRiskDescription(parts: RiskDescriptionParts) {
  return `Risk of ${parts.event} Due to ${parts.cause} Resulting in ${parts.impact}`;
}

function formatSavedAt(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function answerLabel(question: DaxonQuestion, answer: string) {
  return (
    question.options?.find((option) => option.value === answer)?.label || answer
  );
}

export default function IsraAssessmentPage() {
  const { user } = useAuth();
  const ownerRef = useRef(user);
  ownerRef.current = user;
  const boot = useMemo(() => loadSessionStore(user), [user?.id]);
  const bootSession =
    boot.sessions.find((session) => session.id === boot.activeId) ||
    boot.sessions[0];
  const [sessions, setSessions] = useState(boot.sessions);
  const [activeId, setActiveId] = useState(boot.activeId);
  const [answers, setAnswers] = useState<Record<string, string>>(
    bootSession.answers,
  );
  const [index, setIndex] = useState(Number(bootSession.index) || 0);
  const [riskCount, setRiskCount] = useState(
    Math.max(1, Number(bootSession.riskCount) || 1),
  );
  const [input, setInput] = useState(bootSession.input || "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [paused, setPaused] = useState(Boolean(bootSession.paused));
  const [savedAt, setSavedAt] = useState(bootSession.savedAt || "");
  const [resumed, setResumed] = useState(false);
  const [sourceAssessmentId, setSourceAssessmentId] = useState<
    number | undefined
  >(bootSession.sourceAssessmentId);
  const [publishedRevision, setPublishedRevision] = useState(false);
  const [completedDepartment, setCompletedDepartment] = useState("");
  const [manageDepartments, setManageDepartments] = useState(false);
  const [departments, setDepartments] = useState<
    { department: string; departmentKey: string }[]
  >([]);
  const [riskDescription, setRiskDescription] = useState<RiskDescriptionParts>(
    () => parseRiskDescription(bootSession.input || ""),
  );
  const [listItems, setListItems] = useState<string[]>(() =>
    parseDaxonList(bootSession.input || ""),
  );
  const [followupRows, setFollowupRows] = useState<SystemOwnerRow[]>([]);
  const chatEnd = useRef<HTMLDivElement>(null);
  const hydratedQuestion = useRef(false);
  const pendingInput = useRef<string | null>(bootSession.input || "");
  const sessionsRef = useRef(sessions);
  const activeIdRef = useRef(activeId);
  const skipPersist = useRef(false);
  sessionsRef.current = sessions;
  activeIdRef.current = activeId;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const questions = useMemo(() => buildDaxonQuestions(riskCount), [riskCount]);
  const safeIndex = Math.min(index, questions.length - 1);
  const current = questions[safeIndex];
  const isRiskDescription = /^risk\.\d+\.description$/.test(current.id);
  const matchedDepartment =
    current.id === "department"
      ? departments.find(
          (item) =>
            item.department === canonicalDepartmentName(input, departments),
        )
      : undefined;
  const currentCreatedAt =
    sessions.find((session) => session.id === activeId)?.createdAt ||
    bootSession.createdAt;

  const snapshotSession = (overrides: Partial<DaxonSession> = {}): DaxonSession => ({
    id: activeIdRef.current,
    answers,
    index: safeIndex,
    riskCount,
    input,
    paused,
    savedAt,
    createdAt: currentCreatedAt,
    sourceAssessmentId,
    ...overrides,
  });

  const commitStore = (next: DaxonSessionStore) => {
    writeSessionStore(next, ownerRef.current);
    sessionsRef.current = next.sessions;
    activeIdRef.current = next.activeId;
    setSessions(next.sessions);
    setActiveId(next.activeId);
  };

  const applySession = (
    session: DaxonSession,
    options?: { resumed?: boolean },
  ) => {
    pendingInput.current = session.input;
    hydratedQuestion.current = false;
    skipPersist.current = true;
    activeIdRef.current = session.id;
    setActiveId(session.id);
    setAnswers(session.answers);
    setIndex(session.index);
    setRiskCount(session.riskCount);
    setInput(session.input);
    setRiskDescription(parseRiskDescription(session.input));
    setListItems(parseDaxonList(session.input));
    setFollowupRows([]);
    setPaused(session.paused);
    setSavedAt(session.savedAt);
    setSourceAssessmentId(session.sourceAssessmentId);
    setPublishedRevision(false);
    setResumed(Boolean(options?.resumed));
    setCompletedDepartment("");
    setError("");
  };

  useEffect(() => {
    const savedAnswer = answers[current.id] || "";
    const restored = pendingInput.current;
    const nextInput = restored != null ? restored : savedAnswer;
    pendingInput.current = null;
    hydratedQuestion.current = true;
    setInput(nextInput);
    if (/^risk\.\d+\.description$/.test(current.id))
      setRiskDescription(parseRiskDescription(nextInput));
    if (current.type === "list") setListItems(parseDaxonList(nextInput));
    if (current.type === "list-followup") {
      const rows = mergeSystemOwners(
        listedItemsFromAnswer(
          answers[current.sourceQuestionId || ""] || "",
        ),
        nextInput,
      );
      setFollowupRows(rows);
      setInput(rows.length ? serializeSystemOwners(rows) : "None");
    }
    setError("");
    chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [current.id]);
  useEffect(() => {
    if (completedDepartment) return;
    if (skipPersist.current) {
      skipPersist.current = false;
      return;
    }
    const next = upsertSession(
      { activeId: activeIdRef.current, sessions: sessionsRef.current },
      snapshotSession(),
    );
    writeSessionStore(
      { ...next, activeId: activeIdRef.current },
      ownerRef.current,
    );
    sessionsRef.current = next.sessions;
    setSessions(next.sessions);
  }, [
    answers,
    index,
    riskCount,
    input,
    paused,
    savedAt,
    sourceAssessmentId,
    completedDepartment,
  ]);

  useEffect(() => {
    void api("/departments")
      .then((response) =>
        setDepartments(
          (response.data || []).map((row: { name: string; departmentKey: string }) => ({
            department: row.name,
            departmentKey: row.departmentKey,
          })),
        ),
      )
      .catch(() => setDepartments([]));
  }, [manageDepartments]);

  const reviseId = Number(searchParams.get("revise") || "");
  useEffect(() => {
    if (!reviseId) return;
    let active = true;
    const startRevision = async () => {
      let payload: {
        id: number;
        questionnaireResponses?: unknown;
        riskCount?: number;
      } | null = null;
      try {
        const stored = sessionStorage.getItem(reviseStorageKey(ownerRef.current));
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Number(parsed?.id) === reviseId) payload = parsed;
        }
      } catch {
        payload = null;
      }
      if (!payload) {
        const response = await api(`/isra-spog/assessments/${reviseId}`);
        payload = response.data;
      }
      if (!active || !payload) return;
      const existing = sessionsRef.current.find(
        (session) => session.sourceAssessmentId === reviseId,
      );
      const revision = existing || sessionFromSubmission(payload);
      const currentSession = snapshotSession({ paused: true });
      const currentIsBlank =
        !Object.keys(currentSession.answers).length &&
        !currentSession.input &&
        !currentSession.sourceAssessmentId;
      let next: DaxonSessionStore = {
        activeId: activeIdRef.current,
        sessions: sessionsRef.current,
      };
      if (!currentIsBlank && currentSession.id !== revision.id)
        next = upsertSession(next, currentSession);
      next = {
        ...upsertSession(next, { ...revision, paused: false }),
        activeId: revision.id,
      };
      commitStore(next);
      applySession({ ...revision, paused: false }, { resumed: true });
      sessionStorage.removeItem(reviseStorageKey(ownerRef.current));
      setSearchParams({}, { replace: true });
    };
    void startRevision().catch((reason) => {
      if (active)
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load that Daxon submission.",
        );
    });
    return () => {
      active = false;
    };
  }, [reviseId]);

  const submitAnswer = async (event: any) => {
    event.preventDefault();
    const value =
      current.type === "list"
        ? serializeDaxonList(listItems)
        : current.type === "list-followup"
          ? followupRows.length
            ? serializeSystemOwners(followupRows)
            : "None"
          : current.id === "department"
            ? canonicalDepartmentName(input, departments)
            : input.trim();
    const validationError = validateDaxonAnswer(current, value, {
      ...answers,
      [current.id]: value,
    });
    if (validationError) {
      setError(validationError);
      return;
    }
    let nextAnswers = { ...answers, [current.id]: value };
    const moreRiskMatch = current.id.match(/^risk\.(\d+)\.more$/);
    if (moreRiskMatch) {
      const currentRiskIndex = Number(moreRiskMatch[1]);
      if (value === "Yes") {
        setRiskCount(Math.max(riskCount, currentRiskIndex + 2));
      } else {
        nextAnswers = Object.fromEntries(
          Object.entries(nextAnswers).filter(([key]) => {
            const riskKey = key.match(/^risk\.(\d+)\./);
            return !riskKey || Number(riskKey[1]) <= currentRiskIndex;
          }),
        );
        setRiskCount(currentRiskIndex + 1);
      }
      setAnswers(nextAnswers);
      setError("");
      setIndex(safeIndex + 1);
      return;
    }
    setAnswers(nextAnswers);
    setError("");
    if (safeIndex < questions.length - 1) {
      setIndex(safeIndex + 1);
      return;
    }
    setSubmitting(true);
    try {
      const submission = buildDaxonSubmission(nextAnswers);
      if (sourceAssessmentId) {
        await api(`/isra-spog/assessments/${sourceAssessmentId}`, {
          method: "PUT",
          body: JSON.stringify(submission),
        });
      } else {
        await api("/isra-spog/import", {
          method: "POST",
          body: JSON.stringify(submission),
        });
      }
      const remaining = removeSession(
        { activeId: activeIdRef.current, sessions: sessionsRef.current },
        activeIdRef.current,
      );
      commitStore(remaining);
      setPublishedRevision(Boolean(sourceAssessmentId));
      setSourceAssessmentId(undefined);
      setCompletedDepartment(submission.department);
      void api("/departments")
        .then((response) =>
          setDepartments(
            (response.data || []).map(
              (row: { name: string; departmentKey: string }) => ({
                department: row.name,
                departmentKey: row.departmentKey,
              }),
            ),
          ),
        )
        .catch(() => undefined);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Daxon could not submit the assessment.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const submitOnEnter = (
    event: KeyboardEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    )
      return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  const updateRiskDescription = (
    field: keyof RiskDescriptionParts,
    value: string,
  ) => {
    const next = { ...riskDescription, [field]: value };
    setRiskDescription(next);
    setInput(assembleRiskDescription(next));
  };

  const updateListItems = (next: string[]) => {
    const rows = next.length ? next : [""];
    setListItems(rows);
    setInput(serializeDaxonList(rows));
  };

  const updateFollowupRow = (
    itemIndex: number,
    field: "owner" | "admins",
    value: string,
  ) => {
    const next = followupRows.map((row, index) =>
      index === itemIndex ? { ...row, [field]: value } : row,
    );
    setFollowupRows(next);
    setInput(serializeSystemOwners(next));
  };

  const persistProgress = (nextPaused: boolean) => {
    const stamp = new Date().toISOString();
    const next = upsertSession(
      { activeId: activeIdRef.current, sessions: sessionsRef.current },
      snapshotSession({ paused: nextPaused, savedAt: stamp }),
    );
    commitStore({ ...next, activeId: activeIdRef.current });
    setSavedAt(stamp);
    return stamp;
  };

  const saveProgress = () => {
    persistProgress(true);
    setPaused(true);
    setResumed(false);
    setError("");
  };

  const resumeProgress = () => {
    persistProgress(false);
    setPaused(false);
    setResumed(true);
  };

  const openSession = (session: DaxonSession) => {
    const stamp = savedAt || new Date().toISOString();
    let next = upsertSession(
      { activeId: activeIdRef.current, sessions: sessionsRef.current },
      snapshotSession({
        paused: session.id !== activeIdRef.current,
        savedAt: stamp,
      }),
    );
    const resumedSession = { ...session, paused: false };
    next = {
      ...upsertSession(next, resumedSession),
      activeId: session.id,
    };
    commitStore(next);
    applySession(resumedSession, { resumed: true });
  };

  const startNewSession = () => {
    const stamp = new Date().toISOString();
    const created = emptySession();
    let next = upsertSession(
      { activeId: activeIdRef.current, sessions: sessionsRef.current },
      snapshotSession({ paused: true, savedAt: stamp }),
    );
    next = { ...upsertSession(next, created), activeId: created.id };
    commitStore(next);
    applySession(created);
  };

  const discardSavedSession = (session: DaxonSession) => {
    if (
      !confirm(
        `Delete the saved session “${sessionTitle(session)}”? This cannot be undone.`,
      )
    )
      return;
    const next = removeSession(
      { activeId: activeIdRef.current, sessions: sessionsRef.current },
      session.id,
    );
    commitStore(next);
    if (session.id === activeId)
      applySession(
        next.sessions.find((item) => item.id === next.activeId) ||
          next.sessions[0],
      );
  };

  const reset = () => {
    if (
      !confirm(
        "Clear this Daxon session and start again? Other saved sessions will stay.",
      )
    )
      return;
    const created = emptySession({
      id: activeId,
      createdAt: currentCreatedAt,
      sourceAssessmentId,
    });
    commitStore(
      upsertSession(
        { activeId, sessions: sessionsRef.current },
        created,
      ),
    );
    applySession(created);
  };

  const departmentKey = completedDepartment
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en");
  const completedQuestions = questions.slice(
    Math.max(0, safeIndex - 5),
    safeIndex,
  );
  const progress = Math.round((safeIndex / questions.length) * 100);
  const resumableSessions = sortedSessions(sessions).filter(
    (session) =>
      session.paused ||
      Object.keys(session.answers).length > 0 ||
      session.input ||
      session.sourceAssessmentId,
  );
  const revising = Boolean(sourceAssessmentId);

  const sessionButtons = (session: DaxonSession) => (
    <div className="daxon-session-card" key={session.id}>
      <div>
        <strong>{sessionTitle(session)}</strong>
        <span>
          Question {Math.min(session.index + 1, 99)}
          {session.savedAt ? ` · saved ${formatSavedAt(session.savedAt)}` : ""}
          {session.sourceAssessmentId ? " · revising submission" : ""}
        </span>
      </div>
      <div className="daxon-session-card-actions">
        <button type="button" onClick={() => openSession(session)}>
          Continue
        </button>
        <button type="button" onClick={() => discardSavedSession(session)}>
          Delete
        </button>
      </div>
    </div>
  );

  return (
    <div className="page daxon-page">
      <section className="daxon-hero">
        <div className="daxon-hero-copy">
          <p className="daxon-eyebrow">
            GUIDED INFORMATION SECURITY RISK ASSESSMENT
          </p>
          <h1>Turn operational knowledge into a structured ISRA.</h1>
          <p>
            Review the procedure guide, then answer Daxon’s questions one at a
            time. Your completed risk register will be calculated and published
            to your department’s ISRA Single Pane of Glass.
          </p>
          <div className="daxon-hero-pills">
            <span>Save progress and continue later</span>
            <span>Multiple Daxon sessions</span>
            <span>Revise submitted answers</span>
          </div>
          <div className="daxon-hero-actions">
            <a
              className="daxon-procedure-link"
              href="/docs/ISRA-Procedure.pdf"
              target="_blank"
              rel="noreferrer"
            >
              Read the full ISRA procedure
            </a>
            <a className="daxon-start-link" href="#daxon-chat">
              Start with Daxon
            </a>
            <button
              type="button"
              className="daxon-start-link"
              onClick={() => setManageDepartments(true)}
            >
              Manage departments
            </button>
          </div>
        </div>
        <div className="daxon-hero-mascot">
          <img
            src="/assets/daxon-fire-cat.png"
            alt="Daxon, the fire-fur cat assistant"
          />
          <div>
            <strong>Daxon</strong>
            <span>Your ISRA guide</span>
          </div>
        </div>
      </section>

      <section className="daxon-guide" aria-labelledby="guide-title">
        <div className="daxon-section-heading">
          <div>
            <p className="daxon-eyebrow">PROCEDURE AT A GLANCE</p>
            <h2 id="guide-title">Your guide through Parts 1–9</h2>
          </div>
          <p>
            These principles remain visible while you prepare the assessment.
          </p>
        </div>
        <div className="daxon-guide-grid">
          {procedureGuides.map((guide) => (
            <article
              key={guide.part}
              className={current.section === guide.part ? "active" : ""}
            >
              <div className="daxon-guide-number">{guide.part}</div>
              <h3>{guide.title}</h3>
              <p>{guide.summary}</p>
            </article>
          ))}
        </div>
        <div className="daxon-answer-guide">
          <div className="daxon-answer-guide-heading">
            <div>
              <p className="daxon-eyebrow">BEFORE YOU ANSWER DAXON</p>
              <h3>Use the procedure’s completion rules</h3>
            </div>
            <a href="/docs/ISRA-Procedure.pdf" target="_blank" rel="noreferrer">
              Open detailed procedure ↗
            </a>
          </div>
          <div className="daxon-answer-guide-grid">
            {[
              [
                "Information assets",
                "List data and systems as separate named items. Each row is copied into the Information Asset Inventory.",
              ],
              [
                "Risk description",
                "Always write: Risk of [event] Due to [cause] Resulting in [impact]. Keep one distinct risk per submission.",
              ],
              [
                "Likelihood and impact",
                "Score inherent exposure from 1–5 before controls, using evidence, incident history, vulnerabilities, and the Rating Guidance.",
              ],
              [
                "Existing controls",
                "List only controls that are already implemented. Planned controls belong in the action plan.",
              ],
              [
                "Control effectiveness",
                "Choose 0%, 25%, 50%, 75%, or 100% based on design, implementation, operation, evidence, and testing.",
              ],
              [
                "Residual risk and treatment",
                "Score the remaining likelihood and impact, then choose Mitigate, Accept, Transfer, or Avoid.",
              ],
              [
                "Actions and evidence",
                "Mitigation requires a specific action, owner, and commitment date. Retain supporting evidence and approvals where applicable.",
              ],
            ].map(([title, description]) => (
              <article key={title}>
                <strong>{title}</strong>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="daxon-process-strip">
        {[
          "Discover context",
          "Identify risks",
          "Score exposure",
          "Assess controls",
          "Plan treatment",
          "Publish to SPOG",
        ].map((step, stepIndex) => (
          <div key={step}>
            <span>{stepIndex + 1}</span>
            <strong>{step}</strong>
          </div>
        ))}
      </section>

      <section className="daxon-chat-section" id="daxon-chat">
        <div className="daxon-chat-heading">
          <div>
            <p className="daxon-eyebrow">CONVERSATIONAL ISRA FORM</p>
            <h2>Talk with Daxon</h2>
            <p>
              Questions 1–8 gather your operational context. Part 9 builds the
              ISRA row for the risk you want to raise today and calculates its
              inherent and residual scores.
            </p>
          </div>
          <div className="daxon-chat-heading-actions">
            {!completedDepartment && paused && (
              <button type="button" onClick={startNewSession}>
                Start a new session
              </button>
            )}
            {!completedDepartment && !paused && (
              <button
                type="button"
                className="daxon-save-progress"
                disabled={submitting}
                onClick={saveProgress}
              >
                Save progress
              </button>
            )}
            <button type="button" onClick={reset}>
              Start over
            </button>
          </div>
        </div>

        <div className="daxon-chat-layout">
          <div className="daxon-progress-panel">
            <img src="/assets/daxon-fire-cat.png" alt="" />
            <strong>
              {completedDepartment
                ? "Assessment complete"
                : paused
                  ? "Progress saved"
                  : current.sectionTitle}
            </strong>
            <span>
              {completedDepartment
                ? `Published for ${completedDepartment}`
                : paused
                  ? `Paused at question ${safeIndex + 1} of ${questions.length}`
                  : `Question ${safeIndex + 1} of ${questions.length}`}
            </span>
            {!completedDepartment && (
              <>
                <div className="daxon-progress-track">
                  <i style={{ width: `${progress}%` }} />
                </div>
                <small>{progress}% complete</small>
              </>
            )}
            <div className="daxon-section-list">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((section) => (
                <span
                  className={
                    current.section === section
                      ? "current"
                      : current.section > section
                        ? "done"
                        : ""
                  }
                  key={section}
                >
                  {section}
                </span>
              ))}
            </div>
            {resumableSessions.some((session) => session.id !== activeId) && (
              <div className="daxon-saved-sessions">
                <small>Saved sessions</small>
                {resumableSessions.map((session) => (
                  <button
                    type="button"
                    className={
                      session.id === activeId ? "current" : undefined
                    }
                    key={session.id}
                    onClick={() => openSession(session)}
                  >
                    {sessionTitle(session)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="daxon-chat-window">
            <div className="daxon-chat-topbar">
              <div
                className={
                  paused ? "daxon-online-dot paused" : "daxon-online-dot"
                }
              />
              <div>
                <strong>Daxon</strong>
                <span>
                  {paused
                    ? "Fire-fur ISRA assistant · Progress saved"
                    : "Fire-fur ISRA assistant · Online"}
                </span>
              </div>
            </div>
            {completedDepartment ? (
              <div className="daxon-complete">
                <img src="/assets/daxon-fire-cat.png" alt="Daxon" />
                <p className="daxon-eyebrow">
                  {publishedRevision ? "ANSWERS UPDATED" : "ASSESSMENT PUBLISHED"}
                </p>
                <h2>
                  {publishedRevision
                    ? "Your Daxon answers have been updated."
                    : "Great work. Your ISRA is now in the SPOG."}
                </h2>
                <p>
                  I stored the assessment under{" "}
                  <strong>{completedDepartment}</strong>
                  {publishedRevision
                    ? ". The same Daxon Answers submission now has your revised responses, the department SPOG is recalculated, and the Information Asset Inventory is rebuilt to match."
                    : ". It is now the current version for that department, the Information Asset Inventory is rebuilt from these answers, and the previous version remains available in import history."}
                </p>
                <div className="daxon-complete-actions">
                  <button
                    className="daxon-primary"
                    onClick={() =>
                      navigate(
                        `/isra?department=${encodeURIComponent(departmentKey)}`,
                      )
                    }
                  >
                    Open department SPOG
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        `/isra/daxon-answers?department=${encodeURIComponent(departmentKey)}`,
                      )
                    }
                  >
                    Open Daxon answers
                  </button>
                </div>
                {resumableSessions.length > 0 && (
                  <div className="daxon-session-list">
                    <small>You still have saved sessions</small>
                    {resumableSessions.map(sessionButtons)}
                  </div>
                )}
              </div>
            ) : paused ? (
              <div className="daxon-complete">
                <img src="/assets/daxon-fire-cat.png" alt="Daxon" />
                <p className="daxon-eyebrow">PROGRESS SAVED</p>
                <h2>This session is saved. Start another, or pick up an earlier one.</h2>
                <p>
                  I saved your answers on this device, including anything you
                  had started typing for question {safeIndex + 1} of{" "}
                  {questions.length}. You can start a new talk with Daxon now,
                  then come back to the first session you saved.
                </p>
                {formatSavedAt(savedAt) && (
                  <small className="daxon-saved-at">
                    Last saved {formatSavedAt(savedAt)}
                  </small>
                )}
                <div className="daxon-complete-actions">
                  <button
                    type="button"
                    className="daxon-primary"
                    onClick={resumeProgress}
                  >
                    Continue this session
                  </button>
                  <button type="button" onClick={startNewSession}>
                    Start a new session
                  </button>
                </div>
                {resumableSessions.length > 0 && (
                  <div className="daxon-session-list">
                    <small>Saved sessions — earliest first</small>
                    {resumableSessions.map(sessionButtons)}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="daxon-messages" aria-live="polite">
                  {safeIndex === 0 && !resumed && (
                    <div className="daxon-bubble bot">
                      <img src="/assets/daxon-fire-cat.png" alt="" />
                      <div>
                        <b>Daxon</b>
                        <p>
                          Hi! I’ll help you complete the ISRA one clear question
                          at a time. Save progress if you need to stop — you can
                          start another session and return to the first one you
                          saved. Your drafts stay on this device until you
                          submit them.
                        </p>
                      </div>
                    </div>
                  )}
                  {revising && (
                    <div className="daxon-bubble bot">
                      <img src="/assets/daxon-fire-cat.png" alt="" />
                      <div>
                        <b>Daxon</b>
                        <p>
                          We’re revising a submitted assessment. Walk through
                          the questions again — previous answers are filled in.
                          Submit to update Daxon answers and the department
                          SPOG.
                        </p>
                      </div>
                    </div>
                  )}
                  {resumed && !revising && (
                    <div className="daxon-bubble bot">
                      <img src="/assets/daxon-fire-cat.png" alt="" />
                      <div>
                        <b>Daxon</b>
                        <p>
                          Welcome back. Your saved answers are here — let’s
                          continue from question {safeIndex + 1}.
                        </p>
                      </div>
                    </div>
                  )}
                  {completedQuestions.map((question) => (
                    <div className="daxon-history-pair" key={question.id}>
                      <div className="daxon-bubble bot compact">
                        <img src="/assets/daxon-fire-cat.png" alt="" />
                        <div>
                          <b>Daxon</b>
                          <p>{question.prompt}</p>
                        </div>
                      </div>
                      <div className="daxon-bubble user">
                        <p>
                          {answerLabel(question, answers[question.id] || "")}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div className="daxon-bubble bot current">
                    <img src="/assets/daxon-fire-cat.png" alt="" />
                    <div>
                      <b>Daxon · {current.sectionTitle}</b>
                      <p>{current.prompt}</p>
                      {current.help && (
                        <small
                          className={
                            /^risk\.\d+\.more$/.test(current.id)
                              ? "daxon-risk-tip"
                              : undefined
                          }
                        >
                          {current.help}
                        </small>
                      )}
                    </div>
                  </div>
                  <div ref={chatEnd} />
                </div>

                <form className="daxon-answer-box" onSubmit={submitAnswer}>
                  {isRiskDescription ? (
                    <div className="daxon-risk-fill-blanks">
                      <label>
                        <strong>Risk of</strong>
                        <input
                          value={riskDescription.event}
                          onChange={(event) =>
                            updateRiskDescription("event", event.target.value)
                          }
                          onKeyDown={submitOnEnter}
                          placeholder="What could happen?"
                          autoFocus
                        />
                      </label>
                      <label>
                        <strong>Due to</strong>
                        <input
                          value={riskDescription.cause}
                          onChange={(event) =>
                            updateRiskDescription("cause", event.target.value)
                          }
                          onKeyDown={submitOnEnter}
                          placeholder="What could cause it?"
                        />
                      </label>
                      <label>
                        <strong>Resulting in</strong>
                        <input
                          value={riskDescription.impact}
                          onChange={(event) =>
                            updateRiskDescription("impact", event.target.value)
                          }
                          onKeyDown={submitOnEnter}
                          placeholder="What would be the impact?"
                        />
                      </label>
                      <div className="daxon-risk-preview">
                        <small>Daxon will submit:</small>
                        <span>{assembleRiskDescription(riskDescription)}</span>
                      </div>
                    </div>
                  ) : current.id === "department" ? (
                    <div className="daxon-department-picker">
                      {departments.length > 0 && (
                        <label>
                          <span>Choose a listed department</span>
                          <select
                            value={matchedDepartment?.department || ""}
                            onChange={(event) => setInput(event.target.value)}
                            onKeyDown={submitOnEnter}
                          >
                            <option value="">Choose a department…</option>
                            {departments.map((item) => (
                              <option
                                key={item.departmentKey}
                                value={item.department}
                              >
                                {item.department}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <label>
                        <span>
                          {departments.length
                            ? "Or type a new department"
                            : "Department name"}
                        </span>
                        <input
                          value={input}
                          onChange={(event) => setInput(event.target.value)}
                          onKeyDown={submitOnEnter}
                          placeholder="e.g. Retail Banking"
                          maxLength={200}
                          autoFocus
                        />
                      </label>
                      <small>
                        If you type a name that is not listed, Daxon will add it
                        to ISRA SPOG, Daxon answers, and the Information Asset
                        Inventory when you submit.
                      </small>
                    </div>
                  ) : current.type === "list" ? (
                    <div className="daxon-list-answer">
                      <div className="daxon-list-answer-rows">
                        {listItems.map((item, itemIndex) => (
                          <label className="daxon-list-row" key={itemIndex}>
                            <span aria-hidden="true">•</span>
                            <input
                              value={item}
                              onChange={(event) => {
                                const next = [...listItems];
                                next[itemIndex] = event.target.value;
                                updateListItems(next);
                              }}
                              onKeyDown={(event) => {
                                if (
                                  event.key !== "Enter" ||
                                  event.shiftKey ||
                                  event.nativeEvent.isComposing
                                )
                                  return;
                                event.preventDefault();
                                if (listItems[itemIndex].trim()) {
                                  const next = [...listItems];
                                  next.splice(itemIndex + 1, 0, "");
                                  updateListItems(next);
                                }
                              }}
                              placeholder={
                                current.placeholder || "e.g. Named item"
                              }
                              maxLength={150}
                              autoFocus={itemIndex === 0}
                            />
                            {listItems.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  updateListItems(
                                    listItems.filter(
                                      (_, index) => index !== itemIndex,
                                    ),
                                  )
                                }
                              >
                                Remove
                              </button>
                            )}
                          </label>
                        ))}
                      </div>
                      <div className="daxon-list-answer-actions">
                        <button
                          type="button"
                          disabled={listItems.length >= 50}
                          onClick={() => updateListItems([...listItems, ""])}
                        >
                          Add another item
                        </button>
                        <button
                          type="button"
                          onClick={() => updateListItems(["None"])}
                        >
                          None / not applicable
                        </button>
                      </div>
                    </div>
                  ) : current.type === "list-followup" ? (
                    followupRows.length ? (
                      <div className="daxon-followup-list">
                        {followupRows.map((row, itemIndex) => (
                          <article key={row.item}>
                            <strong>{row.item}</strong>
                            <label>
                              <span>Owner</span>
                              <input
                                value={row.owner}
                                onChange={(event) =>
                                  updateFollowupRow(
                                    itemIndex,
                                    "owner",
                                    event.target.value,
                                  )
                                }
                                placeholder="e.g. Julius Faa"
                                autoFocus={itemIndex === 0}
                              />
                            </label>
                            <label>
                              <span>Admins</span>
                              <input
                                value={row.admins}
                                onChange={(event) =>
                                  updateFollowupRow(
                                    itemIndex,
                                    "admins",
                                    event.target.value,
                                  )
                                }
                                placeholder="e.g. Jane Doe, John Smith"
                              />
                            </label>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="daxon-followup-empty">
                        You listed no applications or systems. Send None, or go
                        back and add them first.
                      </div>
                    )
                  ) : current.type === "select" ? (
                    <select
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      onKeyDown={submitOnEnter}
                      autoFocus
                    >
                      <option value="">Choose an answer…</option>
                      {current.options?.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : current.type === "textarea" ? (
                    <textarea
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      onKeyDown={submitOnEnter}
                      placeholder={
                        isRiskDescription
                          ? "Risk of… Due to… Resulting in…"
                          : "Type your answer…"
                      }
                      autoFocus
                    />
                  ) : (
                    <input
                      type={current.type || "text"}
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      onKeyDown={submitOnEnter}
                      placeholder={
                        current.type === "url"
                          ? "https://… (optional)"
                          : "Type your answer…"
                      }
                      autoFocus
                    />
                  )}
                  {error && <div className="daxon-error">{error}</div>}
                  {current.type === "list" ? (
                    <small className="daxon-enter-hint">
                      One name per row · Enter adds another item
                    </small>
                  ) : current.type === "list-followup" ? (
                    <small className="daxon-enter-hint">
                      One owner and admins row for each system you listed
                    </small>
                  ) : current.type === "textarea" && !isRiskDescription ? (
                    <small className="daxon-enter-hint">
                      Press Enter to send · Shift+Enter for a new line
                    </small>
                  ) : null}
                  <div className="daxon-answer-actions">
                    <div className="daxon-answer-actions-left">
                      <button
                        type="button"
                        disabled={safeIndex === 0}
                        onClick={() => setIndex(Math.max(0, safeIndex - 1))}
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        className="daxon-save-progress"
                        disabled={submitting}
                        onClick={saveProgress}
                      >
                        Save progress
                      </button>
                    </div>
                    <button className="daxon-primary" disabled={submitting}>
                          {submitting
                            ? sourceAssessmentId
                              ? "Saving changes…"
                              : "Publishing…"
                            : safeIndex === questions.length - 1
                              ? sourceAssessmentId
                                ? "Save changes to Daxon answers"
                                : "Submit to ISRA SPOG"
                              : current.required === false && !input
                                ? "Skip"
                                : "Send answer"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </section>
      <DepartmentsManager
        open={manageDepartments}
        onClose={() => setManageDepartments(false)}
        onChanged={() =>
          void api("/departments")
            .then((response) =>
              setDepartments(
                (response.data || []).map(
                  (row: { name: string; departmentKey: string }) => ({
                    department: row.name,
                    departmentKey: row.departmentKey,
                  }),
                ),
              ),
            )
            .catch(() => setDepartments([]))
        }
      />
    </div>
  );
}
