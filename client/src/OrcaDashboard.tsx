import { useEffect, useMemo, useState } from "react";
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

const BAND_COLORS: Record<string, string> = {
  Critical: "#fecaca",
  High: "#f97316",
  Medium: "#eab308",
  Low: "#22c55e",
  Unrated: "#94a3b8",
};
const EFFECTIVITY_COLORS: Record<string, string> = {
  Effective: "#22c55e",
  "Needs Improvement": "#eab308",
  "No Control": "#ef4444",
};
const STRATEGY_COLORS: Record<string, string> = {
  Mitigate: "#3b82f6",
  "Transfer/Share": "#8b5cf6",
  Accept: "#eab308",
  Avoid: "#f97316",
};

function residualBand(score?: number | null) {
  if (score == null || !Number.isFinite(score)) return "Unrated";
  if (score >= 15) return "Critical";
  if (score >= 10) return "High";
  if (score >= 5) return "Medium";
  return "Low";
}

function countBy(rows: any[], keyFn: (row: any) => string) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = keyFn(row) || "Unrated";
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()].map(([name, value]) => ({ name, value }));
}

function Badge({ text }: { text: string }) {
  return <span className={badgeClass(text)}>{text || "—"}</span>;
}

export default function OrcaDashboard() {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [theme] = useTheme();
  const colors = chartTheme(theme);

  useEffect(() => {
    api("/orca?all=true")
      .then((response) => setRows(response.data || []))
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "Unable to load ORCA"),
      );
  }, []);

  const stats = useMemo(() => {
    const open = rows.filter((row) => row.status !== "Closed");
    const closed = rows.filter((row) => row.status === "Closed");
    const bands = rows.map((row) => residualBand(row.residualRiskScore));
    const highCritical = bands.filter(
      (band) => band === "High" || band === "Critical",
    ).length;
    const actionRequired = rows.filter((row) => row.actionItemRequired === "Y").length;
    const acceptanceRequired = rows.filter(
      (row) => row.riskAcceptanceRequired === "Y",
    ).length;
    const now = new Date();
    const overdue = open.filter((row) => {
      if (!row.targetCompletionDate) return false;
      const due = new Date(row.targetCompletionDate);
      return !Number.isNaN(due.getTime()) && due < now;
    }).length;
    const residual = countBy(rows, (row) => residualBand(row.residualRiskScore));
    const inherent = countBy(rows, (row) => residualBand(row.inherentRiskScore));
    const effectivity = countBy(
      rows,
      (row) => row.controlEffectivity || "Unrated",
    );
    const strategy = countBy(rows, (row) => row.riskStrategy || "Unrated");
    const process = countBy(rows, (row) => row.process || "Unrated");
    const topRisks = [...open]
      .sort((a, b) => (b.residualRiskScore || 0) - (a.residualRiskScore || 0))
      .slice(0, 8);
    return {
      total: rows.length,
      open: open.length,
      closed: closed.length,
      highCritical,
      actionRequired,
      acceptanceRequired,
      overdue,
      residual,
      inherent,
      effectivity,
      strategy,
      process,
      topRisks,
    };
  }, [rows]);

  if (error) {
    return (
      <div className="form-error" role="alert">
        {error}
      </div>
    );
  }

  return (
    <div className="kri-workspace">
      <p className="kri-workspace-note">
        ORCA risk register only. Ratings, controls, and actions come from the
        same records as the ORCA table. This view does not change residual
        scores.
      </p>
      <div className="kpis">
        <div className="kpi">
          <b>{stats.total}</b>
          <span>ORCA risks</span>
        </div>
        <div className="kpi tone-warn">
          <b>{stats.open}</b>
          <span>Open</span>
        </div>
        <div className="kpi tone-ok">
          <b>{stats.closed}</b>
          <span>Closed</span>
        </div>
        <div className="kpi tone-danger">
          <b>{stats.highCritical}</b>
          <span>High / Critical residual</span>
        </div>
        <div className="kpi tone-warn">
          <b>{stats.actionRequired}</b>
          <span>Action item required</span>
        </div>
        <div className="kpi tone-danger">
          <b>{stats.overdue}</b>
          <span>Overdue open actions</span>
        </div>
      </div>
      <div className="dash-groups kri-dash-groups">
        <section className="dash-group">
          <div className="dash-group-head">
            <h2>Residual risk</h2>
          </div>
          <div className="dash-chart" style={{ height: 220 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={stats.residual}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={46}
                  outerRadius={72}
                >
                  {stats.residual.map((item) => (
                    <Cell
                      key={item.name}
                      fill={BAND_COLORS[item.name] || "#94a3b8"}
                    />
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
            <h2>Inherent risk</h2>
          </div>
          <div className="dash-chart" style={{ height: 220 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={stats.inherent}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={46}
                  outerRadius={72}
                >
                  {stats.inherent.map((item) => (
                    <Cell
                      key={item.name}
                      fill={BAND_COLORS[item.name] || "#94a3b8"}
                    />
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
            <h2>Control effectivity</h2>
          </div>
          <div className="dash-chart" style={{ height: 220 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={stats.effectivity}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={46}
                  outerRadius={72}
                >
                  {stats.effectivity.map((item) => (
                    <Cell
                      key={item.name}
                      fill={EFFECTIVITY_COLORS[item.name] || "#94a3b8"}
                    />
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
            <h2>Treatment strategy</h2>
          </div>
          <div className="dash-chart" style={{ height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={stats.strategy}>
                <CartesianGrid stroke={colors.grid} vertical={false} />
                <XAxis dataKey="name" tick={{ fill: colors.tick, fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: colors.tick }} />
                <Tooltip
                  contentStyle={{
                    background: colors.tooltipBg,
                    borderColor: colors.tooltipBorder,
                    color: colors.tooltipColor,
                  }}
                />
                <Bar dataKey="value" name="Risks">
                  {stats.strategy.map((item) => (
                    <Cell
                      key={item.name}
                      fill={STRATEGY_COLORS[item.name] || "#3b82f6"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
      <section className="dash-group" style={{ marginTop: 18 }}>
        <div className="dash-group-head">
          <h2>Risks by process</h2>
        </div>
        <div className="dash-chart" style={{ height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={stats.process} layout="vertical" margin={{ left: 16 }}>
              <CartesianGrid stroke={colors.grid} horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fill: colors.tick }} />
              <YAxis
                type="category"
                dataKey="name"
                width={220}
                tick={{ fill: colors.tick, fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  background: colors.tooltipBg,
                  borderColor: colors.tooltipBorder,
                  color: colors.tooltipColor,
                }}
              />
              <Bar dataKey="value" name="Risks" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="dash-group" style={{ marginTop: 18 }}>
        <div className="dash-group-head">
          <h2>Highest residual risks</h2>
          <span className="muted">{stats.acceptanceRequired} require risk acceptance</span>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Risk no.</th>
                <th>Process</th>
                <th>Threat</th>
                <th>Residual</th>
                <th>Strategy</th>
                <th>Control</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {stats.topRisks.map((row) => (
                <tr key={row.id}>
                  <td>{row.riskNo}</td>
                  <td>{row.process}</td>
                  <td>{row.riskThreat}</td>
                  <td>
                    <Badge text={residualBand(row.residualRiskScore)} />{" "}
                    {row.residualRiskScore ?? "—"}
                  </td>
                  <td>{row.riskStrategy || "—"}</td>
                  <td>
                    <Badge text={row.controlEffectivity || "—"} />
                  </td>
                  <td>
                    <Badge text={row.status || "—"} />
                  </td>
                </tr>
              ))}
              {!stats.topRisks.length && (
                <tr>
                  <td colSpan={7} className="empty-state">
                    No open ORCA risks.
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
