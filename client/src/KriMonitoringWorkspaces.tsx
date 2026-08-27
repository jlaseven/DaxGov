import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "./api";
import { badgeClass, chartTheme, useTheme } from "./theme";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const LIKELIHOOD = [
  "5 - Frequent",
  "4 - Likely",
  "3 - Possible",
  "2 - Unlikely",
  "1 - Rare",
];
const IMPACT = [
  "5 - Critical",
  "4 - Major",
  "3 - Moderate",
  "2 - Minor",
  "1 - Incidental",
];
const RESIDUAL_COLORS: Record<string, string> = {
  Critical: "#fecaca",
  High: "#f97316",
  Medium: "#eab308",
  Low: "#22c55e",
  Unrated: "#94a3b8",
};
const HEALTH_COLORS: Record<string, string> = {
  Good: "#22c55e",
  Warning: "#eab308",
  Breached: "#ef4444",
  Missing: "#94a3b8",
};

function Badge({ text }: { text: string }) {
  return <span className={badgeClass(text)}>{text || "—"}</span>;
}

export function MonitoringDashboard({
  data,
  onOpenCoverage,
}: {
  data: any;
  onOpenCoverage?: () => void;
}) {
  const [theme] = useTheme();
  const colors = chartTheme(theme);
  const summary = data?.summary || {};
  const residual = Object.entries(data?.residual || {}).map(([name, value]) => ({
    name,
    value,
  }));
  const health = Object.entries(data?.health || {}).map(([name, value]) => ({
    name,
    value,
  }));
  const trend = (data?.trend || []).map((item: any) => ({
    ...item,
    label: MONTHS[(item.month || 1) - 1]?.slice(0, 3),
  }));
  const effectiveness = data?.effectiveness || { score: 0, label: "—" };
  return (
    <div className="kri-workspace">
      <p className="kri-workspace-note">
        Figures come from the same ORCA risks as the ORCA page, plus KRI
        submissions. Residual ratings are not changed here.
      </p>
      <div className="kpis">
        <div className="kpi tone-info">
          <b>{Math.round(summary.coveragePercent || 0)}%</b>
          <span>KRI coverage</span>
        </div>
        <div className="kpi tone-danger">
          <b>{summary.breachedKris || 0}</b>
          <span>Breached KRIs</span>
        </div>
        <div className="kpi tone-warn">
          <b>{summary.highCriticalResidual || 0}</b>
          <span>High / Critical residual</span>
        </div>
        <div className="kpi tone-warn">
          <b>{summary.overdueSubmissions || 0}</b>
          <span>Overdue submissions</span>
        </div>
        <div className="kpi tone-danger">
          <b>{summary.openReviews || 0}</b>
          <span>Open risk reviews</span>
        </div>
      </div>
      <div className="dash-groups kri-dash-groups">
        <section className="dash-group">
          <div className="dash-group-head">
            <h2>Risk monitoring effectiveness</h2>
          </div>
          <div className="kpi">
            <b>
              {effectiveness.score} / 100 · {effectiveness.label}
            </b>
            <span>
              Coverage, on-time submissions, resolved reviews, and high/critical
              coverage. This is not an ORCA residual rating.
            </span>
          </div>
        </section>
        <section className="dash-group">
          <div className="dash-group-head">
            <h2>Residual risk distribution</h2>
          </div>
          <div className="dash-chart" style={{ height: 220 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={residual} dataKey="value" nameKey="name" innerRadius={46} outerRadius={72}>
                  {residual.map((item) => (
                    <Cell key={item.name} fill={RESIDUAL_COLORS[item.name] || "#94a3b8"} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: colors.tooltipBg,
                    borderColor: colors.tooltipBorder,
                    color: colors.tooltipColor,
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="dash-group">
          <div className="dash-group-head">
            <h2>KRI health</h2>
          </div>
          <div className="dash-chart" style={{ height: 220 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={health} dataKey="value" nameKey="name" innerRadius={46} outerRadius={72}>
                  {health.map((item) => (
                    <Cell key={item.name} fill={HEALTH_COLORS[item.name] || "#94a3b8"} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: colors.tooltipBg,
                    borderColor: colors.tooltipBorder,
                    color: colors.tooltipColor,
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="dash-group">
          <div className="dash-group-head">
            <h2>KRI status trend</h2>
          </div>
          <div className="dash-chart" style={{ height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={trend}>
                <CartesianGrid stroke={colors.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: colors.tick }} />
                <YAxis allowDecimals={false} tick={{ fill: colors.tick }} />
                <Tooltip
                  contentStyle={{
                    background: colors.tooltipBg,
                    borderColor: colors.tooltipBorder,
                    color: colors.tooltipColor,
                  }}
                />
                <Legend />
                <Bar dataKey="Good" stackId="a" fill="#22c55e" />
                <Bar dataKey="Warning" stackId="a" fill="#eab308" />
                <Bar dataKey="Breached" stackId="a" fill="#ef4444" />
                <Bar dataKey="Missing" stackId="a" fill="#94a3b8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
      <div className="kpis" style={{ marginTop: 16 }}>
        {Object.entries(data?.attention || {}).map(([label, value]) => (
          <div className="kpi" key={label}>
            <b>{String(value)}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <section className="dash-group" style={{ marginTop: 18 }}>
        <div className="dash-group-head">
          <h2>Top risks requiring attention</h2>
          {onOpenCoverage && (
            <button type="button" onClick={onOpenCoverage}>
              Open coverage
            </button>
          )}
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Risk</th>
                <th>Residual</th>
                <th>Coverage</th>
                <th>Latest KRI</th>
                <th>Attention</th>
              </tr>
            </thead>
            <tbody>
              {(data?.topRisks || []).map((row: any) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.riskNo}</strong>
                    <div className="muted">{row.riskThreat}</div>
                  </td>
                  <td>
                    <Badge text={row.residualBand} />
                  </td>
                  <td>
                    <Badge text={row.monitoringStatus} />
                  </td>
                  <td>
                    <Badge text={row.latestKriStatus || "—"} />
                  </td>
                  <td>
                    <Badge text={row.managementAttention} />
                  </td>
                </tr>
              ))}
              {!data?.topRisks?.length && (
                <tr>
                  <td colSpan={5} className="empty-state">
                    No risks currently need management attention.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function CoverageWorkspace({
  rows,
  summary,
  year,
  onReload,
}: {
  rows: any[];
  summary: any;
  year: number | "";
  onReload: () => Promise<void>;
}) {
  const [required, setRequired] = useState("all");
  const [coverage, setCoverage] = useState("all");
  const [latest, setLatest] = useState("all");
  const [search, setSearch] = useState("");
  const [profile, setProfile] = useState<any>(null);
  const [createFor, setCreateFor] = useState<any>(null);
  const [review, setReview] = useState<any>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (required === "yes" && row.kriMonitoringRequired !== true) return false;
      if (required === "no" && row.kriMonitoringRequired !== false) return false;
      if (required === "unassessed" && row.kriMonitoringRequired != null) return false;
      if (coverage !== "all" && row.monitoringStatus !== coverage) return false;
      if (latest !== "all" && row.latestKriStatus !== latest) return false;
      if (search) {
        const hay = `${row.riskNo} ${row.process} ${row.riskThreat}`.toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, required, coverage, latest, search]);

  return (
    <div className="kri-workspace">
      <p className="kri-workspace-note">
        This is a monitoring view of the same ORCA risks. The ORCA page itself
        is unchanged. Use Open ORCA to jump to the register.
      </p>
      <div className="kpis">
        <div className="kpi"><b>{summary.totalRisks || 0}</b><span>Total ORCA risks</span></div>
        <div className="kpi"><b>{summary.monitoringRequired || 0}</b><span>Monitoring required</span></div>
        <div className="kpi tone-ok"><b>{summary.covered || 0}</b><span>Covered</span></div>
        <div className="kpi tone-warn"><b>{summary.partiallyCovered || 0}</b><span>Partially covered</span></div>
        <div className="kpi tone-danger"><b>{summary.unmapped || 0}</b><span>Unmapped</span></div>
        <div className="kpi"><b>{summary.notRequired || 0}</b><span>Not required</span></div>
        <div className="kpi tone-danger"><b>{summary.reviewRequired || 0}</b><span>Review required</span></div>
      </div>
      <div className="toolbar">
        <input
          placeholder="Search CYB-*, process, or threat"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select value={required} onChange={(event) => setRequired(event.target.value)}>
          <option value="all">KRI required: All</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
          <option value="unassessed">Not assessed</option>
        </select>
        <select value={coverage} onChange={(event) => setCoverage(event.target.value)}>
          <option value="all">Coverage: All</option>
          <option>Covered</option>
          <option>Partially Covered</option>
          <option>Unmapped</option>
          <option>Review Required</option>
          <option>Not Required</option>
          <option>Not Assessed</option>
        </select>
        <select value={latest} onChange={(event) => setLatest(event.target.value)}>
          <option value="all">Latest KRI: All</option>
          <option>Good</option>
          <option>Warning</option>
          <option>Breached</option>
        </select>
      </div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Risk no.</th>
              <th>Process</th>
              <th>Risk</th>
              <th>Residual</th>
              <th>KRI required</th>
              <th>Mapped KRIs</th>
              <th>Coverage</th>
              <th>Latest KRI</th>
              <th>Risk review</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <Fragment key={row.id}>
                <tr className={expanded === row.id ? "row-expanded" : ""}>
                  <td>{row.riskNo}</td>
                  <td>{row.process}</td>
                  <td>{row.riskThreat}</td>
                  <td>
                    <Badge text={row.residualBand} />
                    {row.residualRiskScore != null ? ` ${row.residualRiskScore}` : ""}
                  </td>
                  <td>
                    {row.kriMonitoringRequired == null
                      ? "Not assessed"
                      : row.kriMonitoringRequired
                        ? "Yes"
                        : "No"}
                  </td>
                  <td>{row.mappedKriCount}</td>
                  <td>
                    <Badge text={row.monitoringStatus} />
                  </td>
                  <td>
                    <Badge text={row.latestKriStatus || "—"} />
                  </td>
                  <td>{row.openReviewCount ? "Open" : "—"}</td>
                  <td className="actions-col">
                    <button type="button" onClick={() => setExpanded(expanded === row.id ? null : row.id)}>
                      {expanded === row.id ? "Hide KRIs" : "KRIs"}
                    </button>{" "}
                    <button type="button" onClick={() => setProfile(row)}>
                      Review monitoring
                    </button>{" "}
                    <button type="button" onClick={() => setCreateFor(row)}>
                      Create KRI
                    </button>{" "}
                    {row.openReviewCount > 0 && (
                      <button
                        type="button"
                        className="primary"
                        onClick={() => setReview(row.openReviews[0])}
                      >
                        Complete review
                      </button>
                    )}{" "}
                    <Link className="button-link" to="/orca">
                      Open ORCA
                    </Link>
                  </td>
                </tr>
                {expanded === row.id && (
                  <tr>
                    <td colSpan={10}>
                      {!row.mappedKris.length && (
                        <p className="muted">No KRIs mapped to this ORCA risk.</p>
                      )}
                      {row.openReviewCount > 0 && (
                        <p className="form-error">
                          KRI BREACH — RISK REVIEW REQUIRED
                        </p>
                      )}
                      {row.mappedKris.map((kri: any) => (
                        <div key={kri.id} className="kri-mapped-row">
                          <strong>
                            {kri.kriNumber} · {kri.keyRiskIndicator}
                          </strong>
                          <span>{kri.owner || "No owner"}</span>
                          <Badge text={kri.currentStatus || kri.submissionStatus} />
                          <span>
                            {kri.currentActual != null
                              ? `Actual ${kri.currentActual}`
                              : "No actual this period"}
                          </span>
                        </div>
                      ))}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={10} className="empty-state">
                  No ORCA risks match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {profile && (
        <MonitoringProfileModal
          row={profile}
          onClose={() => setProfile(null)}
          onSaved={async () => {
            setProfile(null);
            await onReload();
          }}
        />
      )}
      {createFor && (
        <CreateKriModal
          row={createFor}
          year={year}
          onClose={() => setCreateFor(null)}
          onSaved={async () => {
            setCreateFor(null);
            await onReload();
          }}
        />
      )}
      {review && (
        <RiskReviewModal
          review={review}
          row={rows.find((item) => item.id === review.orcaRiskId)}
          onClose={() => setReview(null)}
          onSaved={async () => {
            setReview(null);
            await onReload();
          }}
        />
      )}
    </div>
  );
}

export function SubmissionWorkspace({
  rows,
  kris: sheetKris,
  year,
  onReload,
}: {
  rows: any[];
  kris: any[];
  year: number | "";
  onReload: () => Promise<void>;
}) {
  const period = useMemo(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }, []);
  const kris = useMemo(() => {
    const map = new Map<number, any>();
    for (const row of rows) {
      for (const kri of row.mappedKris || []) {
        if (kri.archived) continue;
        const current = map.get(kri.id);
        map.set(kri.id, {
          ...kri,
          orcaLabels: [...(current?.orcaLabels || []), row.riskNo],
          openReview: row.openReviews?.some((item: any) => item.kriRecordId === kri.id),
        });
      }
    }
    for (const kri of sheetKris || []) {
      if (map.has(kri.id) || kri.archivedAt) continue;
      map.set(kri.id, {
        id: kri.id,
        kriNumber: kri.kriNumber,
        keyRiskIndicator: kri.keyRiskIndicator,
        owner: kri.owner,
        frequency: kri.frequency,
        threshold: kri.threshold,
        currentStatus: null,
        currentActual: null,
        submissionStatus: "DUE",
        orcaLabels: (kri.orcaRisks || []).map((item: any) => item.riskNo),
      });
    }
    return [...map.values()];
  }, [rows, sheetKris]);
  const [values, setValues] = useState<Record<number, string>>({});
  const [remarks, setRemarks] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [result, setResult] = useState<Record<number, string>>({});

  const submit = async (kri: any) => {
    setError("");
    setBusy(kri.id);
    try {
      const actual = values[kri.id] === "" || values[kri.id] == null ? null : Number(values[kri.id]);
      const payload: any = {
        year: Number(year) || period.year,
        month: period.month,
        remarks: remarks[kri.id] || "",
      };
      if (kri.threshold && kri.threshold.mode !== "MANUAL") {
        payload.actualValue = actual;
      } else {
        payload.status = values[kri.id] || undefined;
      }
      const response = await api(`/kri-records/${kri.id}/submissions`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setResult((current) => ({ ...current, [kri.id]: response.data.status }));
      await onReload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to submit");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="kri-workspace">
      <p className="kri-workspace-note">
        {MONTHS[period.month - 1]} {period.year}. Enter the actual result for
        structured KRIs. DaxGov calculates Good / Warning / Breached. Manual
        KRIs still use a status plus remarks.
      </p>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>KRI</th>
              <th>Mapped ORCA</th>
              <th>Threshold</th>
              <th>Actual / status</th>
              <th>Remarks</th>
              <th>Calculated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {kris.map((kri) => {
              const structured = kri.threshold && kri.threshold.mode !== "MANUAL";
              return (
                <tr key={kri.id}>
                  <td>
                    <strong>
                      {kri.kriNumber} · {kri.keyRiskIndicator}
                    </strong>
                    <div className="muted">
                      {kri.owner || "No owner"} · {kri.frequency || "MONTHLY"}
                    </div>
                  </td>
                  <td>{kri.orcaLabels.join(", ")}</td>
                  <td className="muted">
                    {structured
                      ? `${kri.threshold.mode}: Good ${formatBand(kri.threshold.goodMin, kri.threshold.goodMax)}, Warning ${formatBand(kri.threshold.warningMin, kri.threshold.warningMax)}, Breached ${formatBand(kri.threshold.breachMin, kri.threshold.breachMax)}`
                      : "Manual"}
                  </td>
                  <td>
                    {structured ? (
                      <input
                        type="number"
                        step="0.01"
                        value={values[kri.id] ?? kri.currentActual ?? ""}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            [kri.id]: event.target.value,
                          }))
                        }
                      />
                    ) : (
                      <select
                        value={values[kri.id] ?? kri.currentStatus ?? ""}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            [kri.id]: event.target.value,
                          }))
                        }
                      >
                        <option value="">—</option>
                        <option>Good</option>
                        <option>Warning</option>
                        <option>Breached</option>
                      </select>
                    )}
                  </td>
                  <td>
                    <input
                      value={remarks[kri.id] || ""}
                      onChange={(event) =>
                        setRemarks((current) => ({
                          ...current,
                          [kri.id]: event.target.value,
                        }))
                      }
                    />
                  </td>
                  <td>
                    <Badge text={result[kri.id] || kri.currentStatus || kri.submissionStatus} />
                  </td>
                  <td>
                    <button
                      className="primary"
                      type="button"
                      disabled={busy === kri.id}
                      onClick={() => void submit(kri)}
                    >
                      {busy === kri.id ? "Saving…" : "Submit & evaluate"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {!kris.length && (
              <tr>
                <td colSpan={7} className="empty-state">
                  Map a KRI to an ORCA risk, then submit actual results here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatBand(min?: number | null, max?: number | null) {
  if (min == null && max == null) return "—";
  if (min != null && max == null) return `>= ${min}`;
  if (min == null && max != null) return `<= ${max}`;
  if (min === max) return String(min);
  return `${min}–${max}`;
}

function MonitoringProfileModal({
  row,
  onClose,
  onSaved,
}: {
  row: any;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [required, setRequired] = useState(
    row.kriMonitoringRequired == null ? "" : row.kriMonitoringRequired ? "yes" : "no",
  );
  const [rationale, setRationale] = useState(row.monitoringRationale || "");
  const [frequency, setFrequency] = useState(row.monitoringFrequency || "Monthly");
  const [owner, setOwner] = useState(row.monitoringOwner || "");
  const [nextDate, setNextDate] = useState(
    row.nextMonitoringReviewDate ? String(row.nextMonitoringReviewDate).slice(0, 10) : "",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (event: any) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/risk-monitoring/profiles/${row.id}`, {
        method: "PUT",
        body: JSON.stringify({
          kriMonitoringRequired: required === "" ? null : required === "yes",
          monitoringRationale: rationale || null,
          monitoringFrequency: required === "no" ? "NotApplicable" : frequency,
          monitoringOwner: owner || null,
          nextMonitoringReviewDate: nextDate || null,
        }),
      });
      await onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal">
      <form onSubmit={save}>
        <div className="modalhead">
          <h2>Monitoring requirement · {row.riskNo}</h2>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="muted">{row.riskThreat}</p>
        <div className="formgrid">
          <label>
            KRI monitoring required
            <select value={required} onChange={(event) => setRequired(event.target.value)}>
              <option value="">Not yet assessed</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <label>
            Frequency
            <select value={frequency} onChange={(event) => setFrequency(event.target.value)}>
              <option>Monthly</option>
              <option>Quarterly</option>
              <option>EventDriven</option>
              <option>NotApplicable</option>
            </select>
          </label>
          <label>
            Monitoring owner
            <input value={owner} onChange={(event) => setOwner(event.target.value)} />
          </label>
          <label>
            Next monitoring review date
            <input
              type="date"
              value={nextDate}
              onChange={(event) => setNextDate(event.target.value)}
            />
          </label>
          <label className="wide">
            Rationale {required === "no" ? "(required)" : ""}
            <textarea
              value={rationale}
              onChange={(event) => setRationale(event.target.value)}
            />
          </label>
        </div>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

function CreateKriModal({
  row,
  year,
  onClose,
  onSaved,
}: {
  row: any;
  year: number | "";
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (event: any) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const num = (name: string) => {
      const value = String(form.get(name) || "");
      return value === "" ? null : Number(value);
    };
    const threshold = {
      mode: String(form.get("mode")),
      goodMin: num("goodMin"),
      goodMax: num("goodMax"),
      warningMin: num("warningMin"),
      warningMax: num("warningMax"),
      breachMin: num("breachMin"),
      breachMax: num("breachMax"),
    };
    try {
      await api("/risk-monitoring/kris", {
        method: "POST",
        body: JSON.stringify({
          orcaRiskIds: [row.id],
          year: year || undefined,
          riskName: form.get("riskName"),
          kriNumber: form.get("kriNumber"),
          keyRiskIndicator: form.get("keyRiskIndicator"),
          owner: form.get("owner") || null,
          frequency: form.get("frequency"),
          dataSource: form.get("dataSource") || null,
          unit: form.get("unit"),
          direction: form.get("direction"),
          threshold,
        }),
      });
      await onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create KRI");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal">
      <form onSubmit={save}>
        <div className="modalhead">
          <h2>Create KRI for {row.riskNo}</h2>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="formgrid">
          <label>
            KRI number
            <input name="kriNumber" required defaultValue="KRI 1" />
          </label>
          <label>
            Risk name
            <input name="riskName" required defaultValue={row.process} />
          </label>
          <label className="wide">
            Indicator
            <textarea name="keyRiskIndicator" required defaultValue={row.riskThreat} />
          </label>
          <label>
            Owner
            <input name="owner" />
          </label>
          <label>
            Frequency
            <select name="frequency" defaultValue="MONTHLY">
              <option>MONTHLY</option>
              <option>QUARTERLY</option>
              <option>EVENT_DRIVEN</option>
            </select>
          </label>
          <label>
            Data source
            <input name="dataSource" />
          </label>
          <label>
            Unit
            <select name="unit" defaultValue="Count">
              <option>Count</option>
              <option>Percentage</option>
              <option>Days</option>
              <option>Hours</option>
              <option>Currency</option>
              <option>Score</option>
              <option>Custom</option>
            </select>
          </label>
          <label>
            Direction
            <select name="direction" defaultValue="LOWER_IS_BETTER">
              <option>LOWER_IS_BETTER</option>
              <option>HIGHER_IS_BETTER</option>
            </select>
          </label>
          <label>
            Threshold mode
            <select name="mode" defaultValue="LOWER_IS_BETTER">
              <option>LOWER_IS_BETTER</option>
              <option>HIGHER_IS_BETTER</option>
              <option>MANUAL</option>
            </select>
          </label>
          <label>Good min<input name="goodMin" type="number" step="0.01" defaultValue="0" /></label>
          <label>Good max<input name="goodMax" type="number" step="0.01" defaultValue="0" /></label>
          <label>Warning min<input name="warningMin" type="number" step="0.01" defaultValue="1" /></label>
          <label>Warning max<input name="warningMax" type="number" step="0.01" defaultValue="1" /></label>
          <label>Breached min<input name="breachMin" type="number" step="0.01" defaultValue="2" /></label>
          <label>Breached max<input name="breachMax" type="number" step="0.01" /></label>
        </div>
        <p className="muted">
          Example: actual 3 against Good 0 / Warning 1 / Breached ≥ 2 calculates
          BREACHED and opens an ORCA risk review. Residual ratings stay unchanged
          until a person completes that review.
        </p>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save KRI and mapping"}
          </button>
        </div>
      </form>
    </div>
  );
}

function RiskReviewModal({
  review,
  row,
  onClose,
  onSaved,
}: {
  review: any;
  row?: any;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [decision, setDecision] = useState("NO_CHANGE");
  const [rationale, setRationale] = useState("");
  const [newLikelihood, setNewLikelihood] = useState(row?.residualLikelihoodRating || "");
  const [newImpact, setNewImpact] = useState(row?.residualImpactRating || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ratingChange =
    decision === "UPDATE_LIKELIHOOD" ||
    decision === "UPDATE_IMPACT" ||
    decision === "UPDATE_RISK_RATING";
  const save = async (event: any) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/orca-risk-reviews/${review.id}`, {
        method: "PUT",
        body: JSON.stringify({
          decision,
          rationale,
          newLikelihood: ratingChange ? newLikelihood : null,
          newImpact: ratingChange ? newImpact : null,
        }),
      });
      await onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to complete review");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal">
      <form onSubmit={save}>
        <div className="modalhead">
          <h2>ORCA risk review required</h2>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="muted">
          {row?.riskNo} · {review.triggerDetails}. Residual ratings change only
          if you choose to update them.
        </p>
        <p>
          Current residual: <Badge text={row?.residualBand || "—"} />{" "}
          {row?.residualRiskScore ?? ""}
        </p>
        <div className="formgrid">
          <label className="wide">
            Decision
            <select value={decision} onChange={(event) => setDecision(event.target.value)}>
              <option value="NO_CHANGE">No change to current risk assessment</option>
              <option value="UPDATE_LIKELIHOOD">Update residual likelihood</option>
              <option value="UPDATE_IMPACT">Update residual impact</option>
              <option value="UPDATE_RISK_RATING">Update residual risk</option>
              <option value="CREATE_ACTION">Create treatment action</option>
              <option value="ESCALATE">Escalate risk</option>
              <option value="RISK_ACCEPTANCE">Initiate risk acceptance</option>
            </select>
          </label>
          {ratingChange && (
            <>
              <label>
                New residual likelihood
                <select
                  value={newLikelihood}
                  onChange={(event) => setNewLikelihood(event.target.value)}
                >
                  {LIKELIHOOD.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                New residual impact
                <select
                  value={newImpact}
                  onChange={(event) => setNewImpact(event.target.value)}
                >
                  {IMPACT.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label className="wide">
            Rationale
            <textarea
              required
              value={rationale}
              onChange={(event) => setRationale(event.target.value)}
            />
          </label>
        </div>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Complete review"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function useRiskMonitoring() {
  const [coverage, setCoverage] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [dashboard, setDashboard] = useState<any>(null);
  const [error, setError] = useState("");
  const load = async () => {
    setError("");
    try {
      const [cover, dash] = await Promise.all([
        api("/risk-monitoring/coverage"),
        api("/risk-monitoring/dashboard"),
      ]);
      setCoverage(cover.data || []);
      setSummary(cover.meta || {});
      setDashboard(dash.data || null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load risk monitoring",
      );
    }
  };
  useEffect(() => {
    void load();
  }, []);
  return { coverage, summary, dashboard, error, load };
}
