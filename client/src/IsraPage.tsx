import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, csv } from "./api";
import { ImportanceToggle } from "./notifications";
import { DepartmentsManager } from "./DepartmentsManager";
import { israRating } from "./israImport";

const ratingColors: Record<string, string> = {
  Critical: "#ee5363",
  High: "#ff9d42",
  Moderate: "#f3cf52",
  Low: "#55c98f",
  Unrated: "#8797aa",
};
const likelihoodLabels: Record<number, string> = {
  1: "Rare",
  2: "Unlikely",
  3: "Possible",
  4: "Likely",
  5: "Frequent",
};
const impactLabels: Record<number, string> = {
  1: "Incidental",
  2: "Minor",
  3: "Moderate",
  4: "Major",
  5: "Critical",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function dueStatus(risk: any) {
  if (!risk.commitmentDate) return "Missing";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(risk.commitmentDate);
  const days = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return "Overdue";
  if (days <= 30) return "Due ≤30 days";
  return "Future";
}

function residualPosition(risk: any) {
  if (risk.residualLikelihood && risk.residualImpact)
    return { likelihood: risk.residualLikelihood, impact: risk.residualImpact };
  if (!Number.isFinite(risk.residualScore) || risk.residualScore < 1)
    return null;
  let best: any = null;
  for (let likelihood = 1; likelihood <= 5; likelihood++)
    for (let impact = 1; impact <= 5; impact++) {
      const delta = Math.abs(likelihood * impact - risk.residualScore);
      if (
        !best ||
        delta < best.delta ||
        (delta === best.delta && likelihood === risk.inherentLikelihood)
      )
        best = { likelihood, impact, delta };
    }
  return best;
}

function RiskBadge({
  rating,
  score,
}: {
  rating: string;
  score?: number | null;
}) {
  return (
    <span className="isra-rating" style={{ color: ratingColors[rating] }}>
      {score ?? "—"} · {rating}
    </span>
  );
}

function Heatmap({
  title,
  risks,
  kind,
  selected,
  onSelect,
}: {
  title: string;
  risks: any[];
  kind: "inherent" | "residual";
  selected: any;
  onSelect: (value: any) => void;
}) {
  return (
    <article className="isra-card">
      <div className="isra-card-title">
        <h3>{title}</h3>
        <button
          className="isra-text-button"
          onClick={() => onSelect(null)}
          type="button"
        >
          Clear cell filter
        </button>
      </div>
      <div className="isra-heatmap">
        <div className="isra-heat-label">Likelihood ↓ / Impact →</div>
        {[1, 2, 3, 4, 5].map((impact) => (
          <div className="isra-heat-label" key={`impact-${impact}`}>
            {impact} {impactLabels[impact]}
          </div>
        ))}
        {[5, 4, 3, 2, 1].flatMap((likelihood) => [
          <div className="isra-heat-label" key={`likelihood-${likelihood}`}>
            {likelihood} {likelihoodLabels[likelihood]}
          </div>,
          ...[1, 2, 3, 4, 5].map((impact) => {
            const count = risks.filter((risk) => {
              const position =
                kind === "inherent"
                  ? {
                      likelihood: risk.inherentLikelihood,
                      impact: risk.inherentImpact,
                    }
                  : residualPosition(risk);
              return (
                position?.likelihood === likelihood &&
                position?.impact === impact
              );
            }).length;
            const active =
              selected?.kind === kind &&
              selected?.likelihood === likelihood &&
              selected?.impact === impact;
            const rating = israRating(likelihood * impact);
            return (
              <button
                type="button"
                key={`${kind}-${likelihood}-${impact}`}
                className={`isra-heat-cell ${active ? "active" : ""}`}
                style={{ background: ratingColors[rating] }}
                title={`${title}: likelihood ${likelihood}, impact ${impact}, ${count} risk(s)`}
                onClick={() => onSelect({ kind, likelihood, impact })}
              >
                {count}
              </button>
            );
          }),
        ])}
      </div>
      {kind === "residual" &&
        risks.some((risk) =>
          Boolean(
            risk.residualScore &&
            (!risk.residualLikelihood || !risk.residualImpact),
          ),
        ) && (
          <p className="isra-hint">
            Where residual likelihood and impact are absent, position is
            estimated from the residual score.
          </p>
        )}
    </article>
  );
}

const CHART_SERIES = [
  "#4d8eff",
  "#39d9c6",
  "#ff9d42",
  "#c084fc",
  "#f3cf52",
  "#ee5363",
  "#67e8f9",
  "#86efac",
  "#fb7185",
  "#93c5fd",
  "#fcd34d",
  "#a5b4fc",
];

function seriesColor(name: string, index: number) {
  return ratingColors[name] || CHART_SERIES[index % CHART_SERIES.length];
}

function truncateLabel(value: string, max = 22) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function IsraChartTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: { payload: { name: string; value: number }; value: number }[];
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const value = Number(item.value) || 0;
  const share = total ? Math.round((value / total) * 1000) / 10 : 0;
  return (
    <div className="isra-chart-tooltip">
      <strong>{item.payload.name}</strong>
      <span>
        {value.toLocaleString()} {value === 1 ? "risk" : "risks"}
        {total ? ` · ${share}% of view` : ""}
      </span>
    </div>
  );
}

function ChartLegend({
  data,
  total,
}: {
  data: { name: string; value: number }[];
  total: number;
}) {
  return (
    <ul className="isra-chart-legend">
      {data.map((item, index) => (
        <li key={item.name}>
          <i style={{ background: seriesColor(item.name, index) }} />
          <span title={item.name}>{item.name}</span>
          <b>
            {item.value}
            {total
              ? ` · ${Math.round((item.value / total) * 1000) / 10}%`
              : ""}
          </b>
        </li>
      ))}
    </ul>
  );
}

function IsraPortfolioChart({
  kind,
  data,
  emptyLabel,
}: {
  kind: "donut" | "hbar";
  data: { name: string; value: number }[];
  emptyLabel: string;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const visible = data.filter((item) => item.value > 0);
  if (!total || !visible.length)
    return <p className="isra-chart-empty">{emptyLabel}</p>;

  const chartKind =
    kind === "donut" && visible.length > 7 ? "hbar" : kind;

  if (chartKind === "donut") {
    return (
      <div className="isra-donut-chart">
        <div className="isra-donut">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={visible}
                dataKey="value"
                nameKey="name"
                innerRadius={58}
                outerRadius={86}
                paddingAngle={2}
                stroke="#0d1b2e"
                strokeWidth={2}
              >
                {visible.map((entry, index) => (
                  <Cell
                    key={entry.name}
                    fill={seriesColor(entry.name, index)}
                  />
                ))}
              </Pie>
              <Tooltip
                content={(props) => (
                  <IsraChartTooltip
                    active={props.active}
                    payload={props.payload as any}
                    total={total}
                  />
                )}
                cursor={{ fill: "transparent" }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="isra-donut-center">
            <strong>{total}</strong>
            <span>{total === 1 ? "risk" : "risks"}</span>
          </div>
        </div>
        <ChartLegend data={data} total={total} />
      </div>
    );
  }

  const rowHeight = Math.max(260, visible.length * 34 + 28);
  const axisWidth = Math.min(
    168,
    Math.max(
      92,
      ...visible.map((item) => Math.min(item.name.length * 7.2, 168)),
    ),
  );
  return (
    <ResponsiveContainer width="100%" height={rowHeight}>
      <BarChart
        data={visible}
        layout="vertical"
        margin={{ top: 4, right: 28, left: 4, bottom: 4 }}
      >
        <CartesianGrid
          stroke="#263b55"
          strokeDasharray="3 3"
          horizontal={false}
        />
        <XAxis
          type="number"
          allowDecimals={false}
          tick={{ fill: "#9fb2c8", fontSize: 11 }}
          axisLine={{ stroke: "#36516e" }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={axisWidth}
          tick={{ fill: "#cfe0f2", fontSize: 11 }}
          tickFormatter={(value) => truncateLabel(String(value))}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          content={(props) => (
            <IsraChartTooltip
              active={props.active}
              payload={props.payload as any}
              total={total}
            />
          )}
          cursor={{ fill: "#ffffff08" }}
        />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={22} barSize={18}>
          {visible.map((entry, index) => (
            <Cell key={entry.name} fill={seriesColor(entry.name, index)} />
          ))}
          <LabelList
            dataKey="value"
            position="right"
            fill="#edf5ff"
            fontSize={11}
            fontWeight={700}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function countBy(risks: any[], field: string, limit = 12) {
  const counts = new Map<string, number>();
  risks.forEach((risk) => {
    const value = String(risk[field] || "Unspecified");
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return {
    data: ranked.slice(0, limit).map(([name, value]) => ({ name, value })),
    extra: Math.max(0, ranked.length - limit),
  };
}

export default function IsraPage() {
  const [data, setData] = useState<any>({
    risks: [],
    findings: [],
    departments: [],
    assessments: [],
    recentImports: [],
  });
  const [scope, setScope] = useState(
    () => new URLSearchParams(window.location.search).get("department") || "",
  );
  const [search, setSearch] = useState("");
  const [rating, setRating] = useState("");
  const [process, setProcess] = useState("");
  const [treatment, setTreatment] = useState("");
  const [due, setDue] = useState("");
  const [heat, setHeat] = useState<any>(null);
  const [editRisk, setEditRisk] = useState<any>(null);
  const [savingRisk, setSavingRisk] = useState(false);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [manageDepartments, setManageDepartments] = useState(false);

  const load = async (department = scope) => {
    setLoading(true);
    try {
      const response = await api(
        `/isra-spog${department ? `?department=${encodeURIComponent(department)}` : ""}`,
      );
      setData(response.data);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load(scope);
  }, [scope]);

  const importWorkbook = async (event: any) => {
    event.preventDefault();
    const formElement = event.currentTarget as HTMLFormElement;
    const form = new FormData(formElement);
    const department = String(form.get("department") || "").trim();
    const file = form.get("workbook");
    setError("");
    setMessage("");
    if (!department) return setError("Enter the department for this ISRA.");
    if (!(file instanceof File) || !file.size)
      return setError("Select an ISRA workbook to import.");
    setImporting(true);
    try {
      const params = new URLSearchParams({
        department,
        fileName: file.name,
      });
      const response = await fetch(
        "/api/isra-spog/import-workbook?" + params.toString(),
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "X-Requested-With": "DaxGov",
          },
          body: file,
        },
      );
      const json = response.status === 204 ? {} : await response.json();
      if (!response.ok)
        throw new Error(json.error || "Unable to import the ISRA.");
      setMessage(
        `Imported ${json.meta?.riskCount ?? "the"} risks for ${department} with ${
          json.meta?.findingCount ?? 0
        } data-quality finding(s).`,
      );
      formElement.reset();
      setScope("");
      await load("");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to import the ISRA.",
      );
    } finally {
      setImporting(false);
    }
  };

  const activateImport = async (assessment: any) => {
    if (
      !confirm(
        `Use ${assessment.sourceFile} as the current ISRA for ${assessment.department}?`,
      )
    )
      return;
    await api(`/isra-spog/assessments/${assessment.id}/activate`, {
      method: "POST",
    });
    await load(scope);
  };

  const deleteRisk = async (risk: any) => {
    if (
      !confirm(
        `Delete ISRA risk ${risk.riskReference || risk.id}? This cannot be undone.`,
      )
    )
      return;
    await api(`/isra-spog/risks/${risk.id}`, { method: "DELETE" });
    if (editRisk?.id === risk.id) setEditRisk(null);
    await load(scope);
  };

  const deleteAssessment = async (assessment: any) => {
    if (
      !confirm(
        `Delete the stored ISRA for ${assessment.department} (${assessment.sourceFile})? Linked information assets from this submission will also be removed.`,
      )
    )
      return;
    await api(`/isra-spog/assessments/${assessment.id}`, { method: "DELETE" });
    await load(scope);
  };

  const saveRisk = async (event: any) => {
    event.preventDefault();
    setSavingRisk(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const numberOrNull = (name: string) => {
      const value = String(form.get(name) || "");
      return value ? Number(value) : null;
    };
    try {
      await api(`/isra-spog/risks/${editRisk.id}`, {
        method: "PUT",
        body: JSON.stringify({
          process: String(form.get("process") || "").trim() || null,
          description: String(form.get("description") || "").trim() || null,
          inherentLikelihood: numberOrNull("inherentLikelihood"),
          inherentImpact: numberOrNull("inherentImpact"),
          existingControls:
            String(form.get("existingControls") || "").trim() || null,
          controlEffectiveness: numberOrNull("controlEffectiveness"),
          residualLikelihood: numberOrNull("residualLikelihood"),
          residualImpact: numberOrNull("residualImpact"),
          riskTreatment: String(form.get("riskTreatment") || "").trim() || null,
          actionPlan: String(form.get("actionPlan") || "").trim() || null,
          actionOwner: String(form.get("actionOwner") || "").trim() || null,
          commitmentDate: String(form.get("commitmentDate") || "") || null,
          evidenceLink: String(form.get("evidenceLink") || "").trim() || null,
        }),
      });
      setEditRisk(null);
      setMessage("ISRA risk updated.");
      await load(scope);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to update the risk",
      );
    } finally {
      setSavingRisk(false);
    }
  };

  const filteredRisks = useMemo(
    () =>
      data.risks.filter((risk: any) => {
        const haystack = Object.values(risk).join(" ").toLocaleLowerCase("en");
        const heatPosition =
          heat?.kind === "residual"
            ? residualPosition(risk)
            : {
                likelihood: risk.inherentLikelihood,
                impact: risk.inherentImpact,
              };
        return (
          (!search || haystack.includes(search.toLocaleLowerCase("en"))) &&
          (!rating || risk.inherentRating === rating) &&
          (!process || risk.process === process) &&
          (!treatment || risk.riskTreatment === treatment) &&
          (!due || dueStatus(risk) === due) &&
          (!heat ||
            (heatPosition?.likelihood === heat.likelihood &&
              heatPosition?.impact === heat.impact))
        );
      }),
    [data.risks, search, rating, process, treatment, due, heat],
  );

  const processes = [
    ...new Set(data.risks.map((risk: any) => risk.process).filter(Boolean)),
  ].sort();
  const treatments = [
    ...new Set(
      data.risks.map((risk: any) => risk.riskTreatment).filter(Boolean),
    ),
  ].sort();
  const averageEffectiveness = data.risks.filter(
    (risk: any) => risk.controlEffectiveness != null,
  );
  const average = averageEffectiveness.length
    ? Math.round(
        (averageEffectiveness.reduce(
          (sum: number, risk: any) => sum + risk.controlEffectiveness,
          0,
        ) /
          averageEffectiveness.length) *
          100,
      )
    : 0;
  const ratingData = ["Critical", "High", "Moderate", "Low", "Unrated"].map(
    (name) => ({
      name,
      value: filteredRisks.filter((risk: any) => risk.inherentRating === name)
        .length,
    }),
  );
  const scopeName = scope
    ? data.departments.find((item: any) => item.departmentKey === scope)
        ?.department || "Department"
    : "Whole organization";
  const clearFilters = () => {
    setSearch("");
    setRating("");
    setProcess("");
    setTreatment("");
    setDue("");
    setHeat(null);
  };

  return (
    <div className="page isra-page">
      <div className="pagehead">
        <div>
          <h1>ISRA Single Pane of Glass</h1>
          <p>
            Department-level and organization-wide information security risk
            visibility
          </p>
        </div>
        <div className="pagehead-actions">
          <Link
            className="isra-secondary isra-page-link"
            to={`/isra/daxon-answers${
              scope ? `?department=${encodeURIComponent(scope)}` : ""
            }`}
          >
            View Daxon answers
          </Link>
          <button type="button" onClick={() => setManageDepartments(true)}>
            Manage departments
          </button>
          <button onClick={() => print()}>Print SPOG</button>
        </div>
      </div>

      <div className="isra-spog">
        <section className="isra-import-panel">
          <div>
            <p className="isra-eyebrow">ISRA WORKBOOK IMPORT</p>
            <h2>Analyze and store an assessment</h2>
            <p>
              Compatible with “ISRA” and “Risk Register” worksheets. A new
              import becomes the current SPOG version for its department;
              earlier imports remain in history.
            </p>
          </div>
          <form onSubmit={importWorkbook} className="isra-import-form">
            <label>
              Department
              <input
                name="department"
                list="isra-departments"
                placeholder="e.g. Information Security"
                required
              />
              <datalist id="isra-departments">
                {data.departments.map((item: any) => (
                  <option key={item.departmentKey} value={item.department} />
                ))}
              </datalist>
            </label>
            <label>
              ISRA workbook
              <input name="workbook" type="file" accept=".xlsx" required />
            </label>
            <button className="isra-primary" disabled={importing}>
              {importing ? "Analyzing and storing…" : "Import ISRA"}
            </button>
          </form>
        </section>
        {error && <div className="isra-message error">{error}</div>}
        {message && <div className="isra-message success">{message}</div>}

        <section className="isra-scope-bar">
          <div>
            <span>Current SPOG scope</span>
            <strong>{scopeName}</strong>
          </div>
          <label>
            View
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

        {loading ? (
          <div className="isra-empty">Loading ISRA data…</div>
        ) : !data.risks.length ? (
          <div className="isra-empty">
            No current ISRA is stored for this scope. Import a workbook above.
          </div>
        ) : (
          <>
            <section>
              <div className="isra-section-heading">
                <div>
                  <p className="isra-eyebrow">EXECUTIVE OVERVIEW</p>
                  <h2>Risk posture at a glance</h2>
                </div>
                <span>{data.assessments.length} current assessment(s)</span>
              </div>
              <div className="isra-kpis">
                {[
                  ["Total risks", data.risks.length, "#39d9c6"],
                  [
                    "Critical risks",
                    data.risks.filter(
                      (risk: any) => risk.inherentRating === "Critical",
                    ).length,
                    ratingColors.Critical,
                  ],
                  [
                    "High risks",
                    data.risks.filter(
                      (risk: any) => risk.inherentRating === "High",
                    ).length,
                    ratingColors.High,
                  ],
                  [
                    "Overdue actions",
                    data.risks.filter(
                      (risk: any) => dueStatus(risk) === "Overdue",
                    ).length,
                    "#ee5363",
                  ],
                  ["Average control effectiveness", `${average}%`, "#4d8eff"],
                  [
                    "Manual reviews",
                    data.risks.filter((risk: any) => risk.manualReview).length,
                    "#f3cf52",
                  ],
                ].map(([label, value, color]) => (
                  <div
                    className="isra-kpi"
                    style={{ "--accent": color } as any}
                    key={String(label)}
                  >
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="isra-section-heading">
                <div>
                  <p className="isra-eyebrow">RISK CONCENTRATION</p>
                  <h2>Interactive 5×5 heatmaps</h2>
                </div>
                <span>Select a cell to filter the register</span>
              </div>
              <div className="isra-heatmap-grid">
                <Heatmap
                  title="Inherent risk"
                  risks={data.risks}
                  kind="inherent"
                  selected={heat}
                  onSelect={setHeat}
                />
                <Heatmap
                  title="Residual risk"
                  risks={data.risks}
                  kind="residual"
                  selected={heat}
                  onSelect={setHeat}
                />
              </div>
            </section>

            <section>
              <div className="isra-section-heading">
                <div>
                  <p className="isra-eyebrow">PORTFOLIO ANALYSIS</p>
                  <h2>Management charts</h2>
                </div>
                <span>
                  Based on {filteredRisks.length} of {data.risks.length} risks in
                  view
                </span>
              </div>
              <div className="isra-chart-grid">
                {(
                  [
                    {
                      title: "Risks by rating",
                      caption: "Inherent rating mix",
                      kind: "donut" as const,
                      data: ratingData,
                      extra: 0,
                    },
                    {
                      title: "Risks by department",
                      caption: "Highest concentrations first",
                      kind: "hbar" as const,
                      ...countBy(filteredRisks, "department"),
                    },
                    {
                      title: "Risks by process",
                      caption: "Highest concentrations first",
                      kind: "hbar" as const,
                      ...countBy(filteredRisks, "process"),
                    },
                    {
                      title: "Risks by treatment",
                      caption: "Selected risk treatment",
                      kind: "donut" as const,
                      ...countBy(filteredRisks, "riskTreatment"),
                    },
                  ]
                ).map((chart) => (
                  <article className="isra-card isra-chart-card" key={chart.title}>
                    <div className="isra-card-title">
                      <div>
                        <h3>{chart.title}</h3>
                        <p>
                          {chart.caption}
                          {chart.extra
                            ? ` · top ${chart.data.length} of ${chart.data.length + chart.extra}`
                            : ""}
                        </p>
                      </div>
                    </div>
                    <IsraPortfolioChart
                      kind={chart.kind}
                      data={chart.data}
                      emptyLabel="No risks in the current view."
                    />
                  </article>
                ))}
              </div>
            </section>

            <section>
              <div className="isra-section-heading">
                <div>
                  <p className="isra-eyebrow">RISK REGISTER</p>
                  <h2>Search, filter, and inspect</h2>
                </div>
                <button
                  className="isra-secondary"
                  onClick={() => csv(filteredRisks, `ISRA ${scopeName}`)}
                >
                  Export filtered CSV
                </button>
              </div>
              <div className="isra-filters">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search ID, department, process, risk, owner…"
                />
                <select
                  value={rating}
                  onChange={(event) => setRating(event.target.value)}
                >
                  <option value="">All ratings</option>
                  {Object.keys(ratingColors).map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
                <select
                  value={process}
                  onChange={(event) => setProcess(event.target.value)}
                >
                  <option value="">All processes</option>
                  {processes.map((item: any) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
                <select
                  value={treatment}
                  onChange={(event) => setTreatment(event.target.value)}
                >
                  <option value="">All treatments</option>
                  {treatments.map((item: any) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
                <select
                  value={due}
                  onChange={(event) => setDue(event.target.value)}
                >
                  <option value="">Any due date</option>
                  <option>Overdue</option>
                  <option>Due ≤30 days</option>
                  <option>Missing</option>
                  <option>Future</option>
                </select>
                <button type="button" onClick={clearFilters}>
                  Reset
                </button>
              </div>
              <div className="isra-table-shell">
                <div className="isra-table-meta">
                  {filteredRisks.length} of {data.risks.length} risks shown
                </div>
                <div className="isra-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th className="importance-col" aria-label="Importance" />
                        <th>Department</th>
                        <th>Risk ID</th>
                        <th>Process</th>
                        <th>Risk description</th>
                        <th>Inherent</th>
                        <th>Residual</th>
                        <th>Treatment</th>
                        <th>Action owner</th>
                        <th>Commitment</th>
                        <th>Evidence</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRisks.slice(0, 250).map((risk: any) => (
                        <tr
                          key={risk.id}
                          className={risk.manualReview ? "review" : ""}
                        >
                          <td className="importance-col">
                            <ImportanceToggle
                              entityType="isra-risks"
                              entityId={risk.id}
                            />
                          </td>
                          <td>{risk.department}</td>
                          <td>{risk.riskReference || "—"}</td>
                          <td>{risk.process || "—"}</td>
                          <td className="isra-description">
                            {risk.description || "—"}
                          </td>
                          <td>
                            <RiskBadge
                              rating={risk.inherentRating}
                              score={risk.inherentScore}
                            />
                          </td>
                          <td>
                            <RiskBadge
                              rating={risk.residualRating}
                              score={risk.residualScore}
                            />
                          </td>
                          <td>{risk.riskTreatment || "—"}</td>
                          <td>{risk.actionOwner || "—"}</td>
                          <td>
                            {formatDate(risk.commitmentDate)}
                            <small>{dueStatus(risk)}</small>
                          </td>
                          <td>
                            {risk.evidenceLink &&
                            /^https?:\/\//i.test(risk.evidenceLink) ? (
                              <a
                                href={risk.evidenceLink}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              onClick={() => setEditRisk(risk)}
                            >
                              Edit
                            </button>{" "}
                            <button
                              type="button"
                              onClick={() => void deleteRisk(risk)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <section>
              <div className="isra-section-heading">
                <div>
                  <p className="isra-eyebrow">ACTION TRACKER</p>
                  <h2>Treatment commitments</h2>
                </div>
              </div>
              <div className="isra-table-shell">
                <div className="isra-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Department</th>
                        <th>Risk ID</th>
                        <th>Action plan</th>
                        <th>Owner</th>
                        <th>Commitment date</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRisks
                        .filter(
                          (risk: any) =>
                            risk.actionPlan ||
                            risk.actionOwner ||
                            risk.commitmentDate,
                        )
                        .slice(0, 250)
                        .map((risk: any) => (
                          <tr key={`action-${risk.id}`}>
                            <td>{risk.department}</td>
                            <td>{risk.riskReference || "—"}</td>
                            <td>{risk.actionPlan || "—"}</td>
                            <td>{risk.actionOwner || "—"}</td>
                            <td>{formatDate(risk.commitmentDate)}</td>
                            <td>
                              <span
                                className={`isra-due ${dueStatus(risk).toLowerCase().replaceAll(" ", "-")}`}
                              >
                                {dueStatus(risk)}
                              </span>
                            </td>
                            <td>
                              <button
                                type="button"
                                onClick={() => setEditRisk(risk)}
                              >
                                Edit
                              </button>{" "}
                              <button
                                type="button"
                                onClick={() => void deleteRisk(risk)}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <section>
              <div className="isra-section-heading">
                <div>
                  <p className="isra-eyebrow">ASSURANCE</p>
                  <h2>Data quality report</h2>
                </div>
                <span>{data.findings.length} finding(s)</span>
              </div>
              <div className="isra-quality-grid">
                {["High", "Medium", "Low"].map((severity) => (
                  <div className="isra-mini-kpi" key={severity}>
                    <strong>
                      {
                        data.findings.filter(
                          (finding: any) => finding.severity === severity,
                        ).length
                      }
                    </strong>
                    <span>{severity} findings</span>
                  </div>
                ))}
              </div>
              <div className="isra-table-shell">
                <div className="isra-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Severity</th>
                        <th>Department</th>
                        <th>Row</th>
                        <th>Risk ID</th>
                        <th>Category</th>
                        <th>Finding</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.findings.slice(0, 500).map((finding: any) => (
                        <tr key={finding.id}>
                          <td>{finding.severity}</td>
                          <td>{finding.department}</td>
                          <td>{finding.rowNumber}</td>
                          <td>{finding.riskReference || "—"}</td>
                          <td>{finding.category}</td>
                          <td>{finding.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </>
        )}

        {!!data.recentImports.length && (
          <section>
            <div className="isra-section-heading">
              <div>
                <p className="isra-eyebrow">STORED ASSESSMENTS</p>
                <h2>Department import history</h2>
              </div>
            </div>
            <div className="isra-table-shell">
              <div className="isra-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Department</th>
                      <th>Source</th>
                      <th>Submitted by</th>
                      <th>Workbook</th>
                      <th>Sheet</th>
                      <th>Imported</th>
                      <th>Risks</th>
                      <th>Quality findings</th>
                      <th>Version</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentImports.map((item: any) => (
                      <tr key={`import-${item.id}`}>
                        <td>{item.department}</td>
                        <td>{item.sourceType}</td>
                        <td>{item.respondentName || "—"}</td>
                        <td>{item.sourceFile}</td>
                        <td>{item.sourceSheet}</td>
                        <td>{formatDate(item.importedAt)}</td>
                        <td>{item.riskCount}</td>
                        <td>{item.qualityFindingCount}</td>
                        <td>
                          {item.isActive ? (
                            <span className="isra-current">Current</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => activateImport(item)}
                            >
                              Make current
                            </button>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() => void deleteAssessment(item)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </div>
      {editRisk && (
        <div className="modal">
          <form className="tpsa-form" onSubmit={saveRisk}>
            <div className="modalhead">
              <div>
                <h2>Edit ISRA risk</h2>
                <p>
                  {editRisk.department} · {editRisk.riskReference || "Unnumbered"}
                </p>
              </div>
              <button type="button" onClick={() => setEditRisk(null)}>
                ×
              </button>
            </div>
            <div className="formgrid">
              <label>
                Process
                <input
                  name="process"
                  defaultValue={editRisk.process || ""}
                />
              </label>
              <label>
                Treatment
                <select
                  name="riskTreatment"
                  defaultValue={editRisk.riskTreatment || "Mitigate"}
                >
                  {["Mitigate", "Accept", "Transfer", "Avoid", "Treat"]
                    .concat(
                      editRisk.riskTreatment &&
                        ![
                          "Mitigate",
                          "Accept",
                          "Transfer",
                          "Avoid",
                          "Treat",
                        ].includes(editRisk.riskTreatment)
                        ? [editRisk.riskTreatment]
                        : [],
                    )
                    .map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                </select>
              </label>
              <label className="wide">
                Risk description
                <textarea
                  name="description"
                  defaultValue={editRisk.description || ""}
                />
              </label>
              <label>
                Inherent likelihood
                <select
                  name="inherentLikelihood"
                  defaultValue={editRisk.inherentLikelihood || ""}
                >
                  <option value="">Unrated</option>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Inherent impact
                <select
                  name="inherentImpact"
                  defaultValue={editRisk.inherentImpact || ""}
                >
                  <option value="">Unrated</option>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Residual likelihood
                <select
                  name="residualLikelihood"
                  defaultValue={editRisk.residualLikelihood || ""}
                >
                  <option value="">Unrated</option>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Residual impact
                <select
                  name="residualImpact"
                  defaultValue={editRisk.residualImpact || ""}
                >
                  <option value="">Unrated</option>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Control effectiveness
                <select
                  name="controlEffectiveness"
                  defaultValue={
                    editRisk.controlEffectiveness == null
                      ? ""
                      : String(editRisk.controlEffectiveness)
                  }
                >
                  <option value="">Not scored</option>
                  <option value="0">0%</option>
                  <option value="0.25">25%</option>
                  <option value="0.5">50%</option>
                  <option value="0.75">75%</option>
                  <option value="1">100%</option>
                </select>
              </label>
              <label>
                Action owner
                <input
                  name="actionOwner"
                  defaultValue={editRisk.actionOwner || ""}
                />
              </label>
              <label className="wide">
                Existing controls
                <textarea
                  name="existingControls"
                  defaultValue={editRisk.existingControls || ""}
                />
              </label>
              <label className="wide">
                Action plan
                <textarea
                  name="actionPlan"
                  defaultValue={editRisk.actionPlan || ""}
                />
              </label>
              <label>
                Commitment date
                <input
                  name="commitmentDate"
                  type="date"
                  defaultValue={
                    editRisk.commitmentDate
                      ? String(editRisk.commitmentDate).slice(0, 10)
                      : ""
                  }
                />
              </label>
              <label>
                Evidence link
                <input
                  name="evidenceLink"
                  type="url"
                  defaultValue={editRisk.evidenceLink || ""}
                />
              </label>
            </div>
            <p className="isra-hint">
              Inherent and residual scores and ratings are recalculated from
              likelihood × impact when you save.
            </p>
            <div className="actions sticky-actions">
              <button type="button" onClick={() => setEditRisk(null)}>
                Cancel
              </button>
              <button className="primary" disabled={savingRisk}>
                {savingRisk ? "Saving…" : "Save risk"}
              </button>
            </div>
          </form>
        </div>
      )}
      <DepartmentsManager
        open={manageDepartments}
        onClose={() => setManageDepartments(false)}
        onChanged={() => void load(scope)}
      />
    </div>
  );
}
