import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "./api";
import { useAuth } from "./auth";
import { reviseStorageKey } from "./daxonSessions";
import { buildDaxonQuestions, type DaxonQuestion } from "./israQuestionnaire";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function answerLabel(question: DaxonQuestion, answer: unknown) {
  const value = String(answer ?? "").trim();
  if (!value) return "Not provided / skipped";
  return (
    question.options?.find((option) => option.value === value)?.label || value
  );
}

function assessmentGroups(assessment: any) {
  const responses = assessment.questionnaireResponses || {};
  const detectedRiskCount = Math.max(
    1,
    ...Object.keys(responses).map((key) => {
      const match = key.match(/^risk\.(\d+)\./);
      return match ? Number(match[1]) + 1 : 1;
    }),
  );
  const questions = buildDaxonQuestions(
    Math.max(assessment.riskCount || 1, detectedRiskCount),
  );
  const knownIds = new Set(questions.map((question) => question.id));
  const ordered = questions
    .filter((question) => Object.hasOwn(responses, question.id))
    .map((question) => ({
      id: question.id,
      prompt: question.prompt,
      answer: answerLabel(question, responses[question.id]),
      sectionTitle: question.sectionTitle,
    }));
  for (const [id, answer] of Object.entries(responses))
    if (!knownIds.has(id))
      ordered.push({
        id,
        prompt: id,
        answer: String(answer || "Not provided / skipped"),
        sectionTitle: "Other stored answers",
      });

  const groups = new Map<string, typeof ordered>();
  for (const item of ordered) {
    const group = groups.get(item.sectionTitle) || [];
    group.push(item);
    groups.set(item.sectionTitle, group);
  }
  return [...groups.entries()];
}

export default function DaxonAnswersPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [scope, setScope] = useState(
    () => new URLSearchParams(window.location.search).get("department") || "",
  );
  const [data, setData] = useState<any>({
    departments: [],
    assessments: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api(
      `/isra-spog/daxon-answers${
        scope ? `?department=${encodeURIComponent(scope)}` : ""
      }`,
    )
      .then((response) => {
        if (active) setData(response.data);
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load Daxon answers.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const nextUrl = scope
      ? `/isra/daxon-answers?department=${encodeURIComponent(scope)}`
      : "/isra/daxon-answers";
    window.history.replaceState(null, "", nextUrl);
    return () => {
      active = false;
    };
  }, [scope, reloadToken]);

  const departmentGroups = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const assessment of data.assessments) {
      const group = groups.get(assessment.department) || [];
      group.push(assessment);
      groups.set(assessment.department, group);
    }
    return [...groups.entries()].sort(([first], [second]) =>
      first.localeCompare(second),
    );
  }, [data.assessments]);

  const scopeName = scope
    ? data.departments.find((item: any) => item.departmentKey === scope)
        ?.department || "Department"
    : "Whole organization";

  const reviseAssessment = (assessment: any) => {
    sessionStorage.setItem(
      reviseStorageKey(user),
      JSON.stringify({
        id: assessment.id,
        department: assessment.department,
        respondentName: assessment.respondentName,
        questionnaireResponses: assessment.questionnaireResponses,
        riskCount: assessment.riskCount,
      }),
    );
    navigate(`/isra-assessment?revise=${assessment.id}`);
  };

  const deleteAssessment = async (assessment: any) => {
    if (
      !confirm(
        `Delete the Daxon submission for ${assessment.department} by ${assessment.respondentName || "unnamed respondent"}? Linked information assets from this submission will also be removed.`,
      )
    )
      return;
    setError("");
    try {
      await api(`/isra-spog/assessments/${assessment.id}`, {
        method: "DELETE",
      });
      setMessage("Daxon submission deleted.");
      setReloadToken((value) => value + 1);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to delete the assessment.",
      );
    }
  };

  return (
    <div className="page isra-page">
      <div className="pagehead">
        <div>
          <h1>Daxon Answer Register</h1>
          <p>Every guided ISRA response, organized by department</p>
        </div>
        <div className="pagehead-actions">
          <Link
            className="isra-secondary isra-page-link"
            to={`/information-assets${
              scope ? `?department=${encodeURIComponent(scope)}` : ""
            }`}
          >
            Open Information Asset Inventory
          </Link>
          <Link
            className="isra-secondary isra-page-link"
            to={`/isra${
              scope ? `?department=${encodeURIComponent(scope)}` : ""
            }`}
          >
            Back to ISRA SPOG
          </Link>
        </div>
      </div>

      <div className="isra-spog daxon-answer-register">
        <section className="isra-scope-bar">
          <div>
            <span>Answer register scope</span>
            <strong>{scopeName}</strong>
          </div>
          <label>
            Department
            <select
              value={scope}
              onChange={(event) => setScope(event.target.value)}
            >
              <option value="">Whole organization</option>
              {data.departments.map((item: any) => (
                <option key={item.departmentKey} value={item.departmentKey}>
                  {item.department}
                </option>
              ))}
            </select>
          </label>
        </section>

        {error && <div className="isra-message error">{error}</div>}
        {message && <div className="isra-message success">{message}</div>}
        {loading ? (
          <div className="isra-empty">Loading Daxon answers…</div>
        ) : !departmentGroups.length ? (
          <div className="isra-empty">
            No Daxon questionnaire responses are stored for this scope yet.
          </div>
        ) : (
          departmentGroups.map(([department, assessments]) => (
            <section className="daxon-answer-department" key={department}>
              <div className="isra-section-heading">
                <div>
                  <p className="isra-eyebrow">DEPARTMENT</p>
                  <h2>{department}</h2>
                </div>
                <span>
                  {assessments.length} Daxon submission
                  {assessments.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="daxon-submission-list">
                {assessments.map((assessment: any, index: number) => (
                  <details
                    className="daxon-submission-card"
                    key={assessment.id}
                    open={index === 0}
                  >
                    <summary>
                      <div>
                        <strong>
                          {assessment.respondentName || "Unnamed respondent"}
                        </strong>
                        <span>{formatDate(assessment.importedAt)}</span>
                      </div>
                      <div className="daxon-submission-meta">
                        <span>{assessment.riskCount} risk(s)</span>
                        <span
                          className={assessment.isActive ? "isra-current" : ""}
                        >
                          {assessment.isActive ? "Current" : "Previous version"}
                        </span>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            reviseAssessment(assessment);
                          }}
                        >
                          Revise with Daxon
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void deleteAssessment(assessment);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </summary>
                    <div className="daxon-submission-answers">
                      {assessmentGroups(assessment).map(([title, answers]) => (
                        <section key={title}>
                          <h3>{title}</h3>
                          <dl>
                            {answers.map((answer) => (
                              <div key={answer.id}>
                                <dt>{answer.prompt}</dt>
                                <dd>{answer.answer}</dd>
                              </div>
                            ))}
                          </dl>
                        </section>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
