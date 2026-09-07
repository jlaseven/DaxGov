import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import {
  Activity,
  BarChart3,
  BookOpen,
  Bot,
  Boxes,
  Building2,
  ClipboardCheck,
  ClipboardList,
  FileSearch,
  FileWarning,
  Gauge,
  Goal,
  Menu,
  Moon,
  Scale,
  Settings,
  ShieldCheck,
  Sun,
  Users,
} from "lucide-react";
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
import { api, csv, downloadActivityCsv, downloadBackup, uploadRestore } from "./api";
import IsraPage from "./IsraPage";
import IsraAssessmentPage from "./IsraAssessmentPage";
import DaxonAnswersPage from "./DaxonAnswersPage";
import InformationAssetInventoryPage from "./InformationAssetInventoryPage";
import RegisterPage from "./RegisterPage";
import UsersPage from "./UsersPage";
import LoginPage, { ChangePasswordPage } from "./LoginPage";
import RegulatoryGuidePage from "./RegulatoryGuidePage";
import OrcaPage from "./OrcaPage";
import KriPage from "./KriPage";
import { useAuth } from "./auth";
import {
  ImportanceToggle,
  NotificationBell,
  NotificationsProvider,
} from "./notifications";
import {
  firstAllowedPath,
  userCanOpen,
} from "./pages";
import { badgeClass, chartTheme, useTheme } from "./theme";
const statuses = [
  "Todo",
  "In Progress",
  "In Progress – At Risk",
  "Done",
  "Deferred",
];
const configs: any = {
  documents: {
    title: "Governance Documents",
    singular: "Document",
    icon: BookOpen,
    filters: [
      ["status", "Status"],
      ["cybersecurityPillar", "Cybersecurity pillar"],
    ],
    defaultVisible: [
      "documentName",
      "status",
      "cybersecurityPillar",
      "commentsRemarks",
      "applicableStandards",
      "applicableBspRegulations",
    ],
    fields: [
      ["documentName", "Document name", "text"],
      [
        "status",
        "Status",
        "select",
        [
          "Outdated",
          "Non-existent",
          "Currently Updating",
          "Updated",
          "For Decommissioning",
        ],
      ],
      [
        "cybersecurityPillar",
        "Cybersecurity pillar",
        "select",
        [
          "Governance",
          "IAM",
          "Cyber Defense",
          "Workplace",
          "Not Cybersecurity",
        ],
      ],
      ["commentsRemarks", "Comments / remarks", "textarea"],
      ["applicableStandards", "Applicable standards", "textarea"],
      ["applicableBspRegulations", "BSP regulations", "textarea"],
    ],
  },
  "opir-actions": {
    title: "OPIR Actions",
    singular: "OPIR action",
    icon: ClipboardCheck,
    filters: [
      ["riskRating", "Risk rating"],
      ["actionStatus", "Action status"],
      [
        "tcdStatus",
        "TCD status",
        ["No TCD", "Due Soon", "On Track", "Overdue", "Completed"],
      ],
      ["actionOwner", "Action owner"],
    ],
    defaultVisible: [
      "opirNumber",
      "incidentTitle",
      "riskRating",
      "actionOwner",
      "actionStatus",
      "effectiveTargetDate",
      "tcdStatus",
      "jiraTicket",
    ],
    extraColumns: [
      ["effectiveTargetDate", "Target / due date", "due"],
      ["tcdStatus", "TCD status", "badge"],
    ],
    fields: [
      ["opirNumber", "OPIR number", "text"],
      ["incidentTitle", "Incident title", "text"],
      ["squad", "Squad", "text"],
      [
        "riskRating",
        "Risk rating",
        "select",
        ["Critical", "High", "Medium", "Low", "Informational", "Unrated"],
      ],
      ["actionOwner", "Action owner", "text"],
      [
        "actionStatus",
        "Action status",
        "select",
        ["Todo", "In Progress", "Blocked", "Completed", "Cancelled"],
      ],
      ["originalTargetDate", "Original target date", "date"],
      ["updatedTargetDate", "Updated target date", "date"],
      ["solution", "Solution", "textarea"],
      ["remarks", "Remarks", "textarea"],
      ["jiraTicket", "Jira link", "url"],
    ],
  },
  "audit-findings": {
    title: "Audit Findings",
    singular: "Finding",
    icon: FileWarning,
    filters: [
      ["riskLevel", "Risk level"],
      ["findingStatus", "Finding status"],
      [
        "overdueStatus",
        "Overdue status",
        ["No TCD", "On Track", "Due Soon", "Overdue", "Closed"],
      ],
      ["managementStatus", "Management status"],
      ["responsiblePersonnel", "Responsible personnel"],
    ],
    defaultVisible: [
      "findingNumber",
      "auditObservation",
      "riskLevel",
      "findingStatus",
      "responsiblePersonnel",
      "effectiveTargetDate",
      "overdueStatus",
    ],
    extraColumns: [
      ["effectiveTargetDate", "Target / due date", "due"],
      ["overdueStatus", "Overdue status", "badge"],
    ],
    fields: [
      ["findingNumber", "Finding number", "text"],
      ["auditObservation", "Audit observation", "textarea"],
      ["year", "Year", "number"],
      ["observationId", "Observation ID", "text"],
      ["division", "Division", "text"],
      ["departmentProcess", "Department / process", "text"],
      [
        "riskLevel",
        "Risk level",
        "select",
        ["Critical", "High", "Medium", "Low", "Informational", "Unrated"],
      ],
      [
        "findingStatus",
        "Finding status",
        "select",
        ["Open", "Evidence Submitted", "Closed"],
      ],
      ["managementStatus", "Management status", "text"],
      ["responsiblePersonnel", "Responsible personnel", "text"],
      ["responsibleDepartment", "Responsible department", "text"],
      ["reportDate", "Report date", "date"],
      ["originalTargetDate", "Original target date", "date"],
      ["updatedTargetDate", "Updated target date", "date"],
      ["observationDetails", "Observation details", "textarea"],
      ["risks", "Risks", "textarea"],
      ["impact", "Impact", "textarea"],
      ["recommendation", "Recommendation", "textarea"],
      ["managementResponse", "Management response", "textarea"],
      ["commitmentActionPlan", "Commitment action plan", "textarea"],
      ["remarks", "Remarks", "textarea"],
      ["evidenceReferences", "Evidence references", "textarea"],
    ],
  },
  objectives: {
    title: "OKRs",
    singular: "Objective",
    icon: Goal,
    filters: [
      ["progress.status", "Calculated status", statuses],
      ["assignees", "Assignee"],
      ["contributors", "Contributor"],
    ],
    defaultVisible: [
      "objectiveId",
      "objectiveName",
      "objectiveStatus",
      "assignees",
      "progress",
      "endDate",
    ],
    extraColumns: [["progress", "Progress", "progress"]],
    children: {
      route: "okr-tasks",
      parentKey: "objectiveId",
      listKey: "tasks",
      singular: "Task",
      nameField: "taskName",
      statusField: "taskStatus",
      fields: [
        ["taskName", "Task name", "text"],
        ["taskStatus", "Status", "select", statuses],
        ["assignees", "Assignees", "text"],
        ["contributors", "Contributors", "text"],
        ["startDate", "Start date", "date"],
        ["endDate", "End date", "date"],
        ["remarks", "Remarks", "textarea"],
      ],
    },
    fields: [
      ["objectiveId", "Objective ID", "text"],
      ["objectiveName", "Objective name", "text"],
      ["objectiveStatus", "Status", "select", statuses],
      ["assignees", "Assignees", "text"],
      ["contributors", "Contributors", "text"],
      ["startDate", "Start date", "date"],
      ["endDate", "End date", "date"],
      ["manualProgressOverride", "Manual progress %", "number"],
    ],
  },
  initiatives: {
    title: "Initiatives",
    singular: "Initiative",
    icon: ShieldCheck,
    filters: [
      ["category", "Category"],
      ["calculatedStatus", "Calculated status", statuses],
      ["owner", "Owner"],
    ],
    defaultVisible: [
      "category",
      "initiativeName",
      "owner",
      "status",
      "calculatedStatus",
      "endDate",
    ],
    extraColumns: [["calculatedStatus", "Calculated status", "badge"]],
    children: {
      route: "sub-initiatives",
      parentKey: "initiativeId",
      listKey: "subInitiatives",
      singular: "Sub-initiative",
      nameField: "subInitiativeName",
      statusField: "status",
      fields: [
        ["subInitiativeName", "Sub-initiative name", "text"],
        ["owner", "Owner", "text"],
        ["status", "Status", "select", statuses],
        ["startDate", "Start date", "date"],
        ["endDate", "End date", "date"],
        ["remarks", "Remarks", "textarea"],
      ],
    },
    fields: [
      ["category", "Category", "text"],
      ["initiativeName", "Initiative name", "text"],
      ["description", "Description", "textarea"],
      ["owner", "Owner", "text"],
      ["status", "Status", "select", statuses],
      ["startDate", "Start date", "date"],
      ["endDate", "End date", "date"],
    ],
  },
};
const nav = [
  ["/", "Dashboard", BarChart3, "dashboard"],
  ["/tpsa-monitoring", "TPSA Monitoring", Building2, "tpsa-monitoring"],
  ["/isra", "ISRA SPOG", FileSearch, "isra"],
  ["/isra-assessment", "ISRA Assessment", Bot, "isra-assessment"],
  ["/orca", "ORCA", ClipboardList, "orca"],
  ["/kris", "KRIs", Gauge, "kris"],
  ["/information-assets", "Information Asset Inventory", Boxes, "information-assets"],
  ["/regulatory-guide", "Regulatory Guide", Scale, "regulatory-guide"],
  ...Object.entries(configs).map(([k, v]: any) => [
    "/" + k,
    v.title,
    v.icon,
    k,
  ]),
  ["/activity-log", "Activity Log", Activity, "activity-log"],
  ["/users", "User Management", Users, "user-management"],
  ["/settings", "Settings", Settings, "settings"],
] as any[];
function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  return (
    <div className="theme-toggle" role="group" aria-label="Color theme">
      <button
        type="button"
        className={theme === "light" ? "active" : ""}
        aria-pressed={theme === "light"}
        onClick={() => setTheme("light")}
      >
        <Sun />
        Light
      </button>
      <button
        type="button"
        className={theme === "dark" ? "active" : ""}
        aria-pressed={theme === "dark"}
        onClick={() => setTheme("dark")}
      >
        <Moon />
        Night
      </button>
    </div>
  );
}
function Layout({ children }: any) {
  const [open, setOpen] = useState(true);
  const { user, signOut } = useAuth();
  const items = nav.filter(([, , , page]) => userCanOpen(user, page));
  return (
    <div className="app">
      <aside className={open ? "" : "closed"}>
        <div className="brand">
          <img
            className="brand-mascot"
            src="/assets/daxon-comic.png"
            alt=""
          />
          <span>DaxGov</span>
        </div>
        <nav>
          {items.map(([to, label, I]) => (
            <NavLink key={to} to={to} end={to === "/"}>
              <I />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <main>
        <header>
          <button
            className="icon"
            onClick={() => setOpen(!open)}
            aria-label="Toggle navigation"
          >
            <Menu />
          </button>
          <span>DaxGov · local governance</span>
          <NotificationBell />
          <ThemeToggle />
          <div className="session-user">
            <div>
              <strong>{user?.displayName}</strong>
              <span className="role-badge">{user?.role}</span>
            </div>
            <button onClick={() => void signOut()}>Sign out</button>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
function PageGuard({
  page,
  children,
}: {
  page: string;
  children: ReactNode;
}) {
  const { user } = useAuth();
  if (!userCanOpen(user, page)) {
    return <Navigate to={firstAllowedPath(user)} replace />;
  }
  return children;
}
function AdminOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user || user.role !== "Admin") {
    return <Navigate to={firstAllowedPath(user)} replace />;
  }
  return children;
}
function Dashboard() {
  const [d, setD] = useState<any>();
  const [theme] = useTheme();
  const chart = chartTheme(theme);
  const nav = useNavigate();
  useEffect(() => {
    api("/dashboard").then((x) => setD(x.data));
  }, []);
  if (!d)
    return (
      <Page title="Executive Dashboard">
        <p>Loading dashboard…</p>
      </Page>
    );
  const groups = [
    {
      title: "Third-party risk",
      href: "/tpsa-monitoring",
      items: [
        ["TPSA records", d.kpis.totalTpsa, "/tpsa-monitoring", "neutral"],
        ["Overdue", d.kpis.overdueTpsa, "/tpsa-monitoring", "danger"],
        ["Ready to send", d.kpis.readyToSendTpsa, "/tpsa-monitoring", "info"],
      ],
    },
    {
      title: "ISRA",
      href: "/isra",
      items: [
        ["ISRA risks", d.kpis.totalIsraRisks, "/isra", "neutral"],
        ["Critical", d.kpis.criticalIsraRisks, "/isra", "danger"],
        ["Overdue actions", d.kpis.overdueIsraActions, "/isra", "warn"],
      ],
    },
    {
      title: "Documents",
      href: "/documents",
      wide: true,
      items: [
        ["All documents", d.kpis.totalDocuments, "/documents", "neutral"],
        ["Updated", d.kpis.updatedDocuments, "/documents?status=Updated", "ok"],
        ["Outdated", d.kpis.outdatedDocuments, "/documents?status=Outdated", "danger"],
        [
          "Updating",
          d.kpis.updatingDocuments,
          "/documents?status=Currently%20Updating",
          "warn",
        ],
        ["Non-existent", d.kpis.nonExistentDocuments, "/documents", "warn"],
        [
          "Decommissioning",
          d.kpis.decommissioningDocuments,
          "/documents",
          "neutral",
        ],
      ],
    },
    {
      title: "OPIR and audit",
      href: "/opir-actions",
      items: [
        ["Open OPIR", d.kpis.openOpir, "/opir-actions", "warn"],
        [
          "Overdue OPIR",
          d.kpis.overdueOpir,
          "/opir-actions?tcdStatus=Overdue",
          "danger",
        ],
        [
          "No TCD",
          d.kpis.noTcdOpir,
          "/opir-actions?tcdStatus=No%20TCD",
          "info",
        ],
        ["Open findings", d.kpis.openFindings, "/audit-findings", "warn"],
        ["High-risk findings", d.kpis.highRiskFindings, "/audit-findings", "danger"],
      ],
    },
    {
      title: "OKRs and initiatives",
      href: "/objectives",
      items: [
        ["Active OKRs", d.kpis.activeOkrs, "/objectives", "info"],
        [
          "Completed initiatives",
          d.kpis.completedInitiatives,
          "/initiatives",
          "ok",
        ],
      ],
    },
  ];
  const chartCards: [string, any[], "bar" | "hbar" | "donut"][] = [
    ["TPSA by status", d.charts.tpsaByStatus, "hbar"],
    ["ISRA by inherent rating", d.charts.israByRating, "donut"],
    ["Documents by pillar", d.charts.documentsByPillar, "bar"],
    ["Overdue OPIR by rating", d.charts.opirRisk, "donut"],
    ["Audit findings by risk", d.charts.auditRisk, "donut"],
    ["OKR progress status", d.charts.okrStatus, "bar"],
    ["Initiative calculated status", d.charts.initiativeStatus, "bar"],
  ];
  return (
    <Page
      title="Executive Dashboard"
      subtitle="Live oversight of cybersecurity governance obligations"
    >
      <div className="dash-groups">
        {groups.map((group) => (
          <section
            className={"panel dash-group" + (group.wide ? " wide" : "")}
            key={group.title}
          >
            <div className="dash-group-head">
              <h2>{group.title}</h2>
              <button type="button" onClick={() => nav(group.href)}>
                Open
              </button>
            </div>
            <div className="kpis dash-kpis">
              {group.items.map(([label, value, href, tone]) => (
                <button
                  className={"kpi tone-" + tone}
                  onClick={() => nav(href as string)}
                  key={label}
                  type="button"
                >
                  <b>{value}</b>
                  <span>{label}</span>
                </button>
              ))}
            </div>
            {group.title === "Documents" && (
              <DocumentStatusPies
                pies={d.charts.documentStatusPies}
                chart={chart}
              />
            )}
          </section>
        ))}
      </div>
      <div className="charts">
        {chartCards.map(([title, data, kind]) => (
          <section className="panel dash-chart" key={title}>
            <h2>{title}</h2>
            <DashboardChart kind={kind} data={data || []} chart={chart} />
          </section>
        ))}
      </div>
      <section className="panel">
        <h2>Latest activity</h2>
        {d.activity.length ? (
          d.activity.map((a: any) => (
            <div className="activity" key={a.timestamp + a.action + a.target_id}>
              <b>{a.action}</b> {a.target_type} {a.target_id}
              {a.actor_username ? ` · ${a.actor_username}` : ""}
              <time>
                {a.timestamp ? new Date(a.timestamp).toLocaleString() : ""}
              </time>
            </div>
          ))
        ) : (
          <p className="empty-state">No recent activity.</p>
        )}
      </section>
    </Page>
  );
}
const CHART_NAMED_COLORS: Record<string, string> = {
  Critical: "#dc2626",
  High: "#ea580c",
  Medium: "#ca8a04",
  Low: "#16a34a",
  Informational: "#6366f1",
  Unrated: "#64748b",
  Todo: "#64748b",
  "In Progress": "#2563eb",
  "In Progress – At Risk": "#d97706",
  Done: "#16a34a",
  Deferred: "#7c3aed",
  Updated: "#16a34a",
  Outdated: "#dc2626",
  "Currently Updating": "#d97706",
  "Non-existent": "#7c3aed",
  "For Decommissioning": "#64748b",
  Overdue: "#dc2626",
  Completed: "#16a34a",
  Governance: "#2563eb",
  IAM: "#0d9488",
  "Cyber Defense": "#7c3aed",
  Workplace: "#d97706",
  "Not Cybersecurity": "#64748b",
};
const CHART_FALLBACK = [
  "#2563eb",
  "#0d9488",
  "#d97706",
  "#7c3aed",
  "#db2777",
  "#0891b2",
  "#65a30d",
  "#ea580c",
];
function chartColor(name: string, index: number) {
  return CHART_NAMED_COLORS[name] || CHART_FALLBACK[index % CHART_FALLBACK.length];
}
function pieShare(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}
function pieCountLabel(props: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  value?: number;
  percent?: number;
}) {
  const {
    cx = 0,
    cy = 0,
    midAngle = 0,
    innerRadius = 0,
    outerRadius = 0,
    value = 0,
    percent = 0,
  } = props;
  if (!percent || percent < 0.07) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.58;
  const x = cx + radius * Math.cos((-midAngle * Math.PI) / 180);
  const y = cy + radius * Math.sin((-midAngle * Math.PI) / 180);
  return (
    <text
      x={x}
      y={y}
      fill="#fff"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
      fontWeight={700}
    >
      {value} ({Math.round(percent * 100)}%)
    </text>
  );
}
function DocumentPieLegend({
  data,
  total,
}: {
  data: { name: string; value: number }[];
  total: number;
}) {
  return (
    <ul className="dash-pie-stats">
      {data.map((item, index) => (
        <li key={item.name}>
          <i style={{ background: chartColor(item.name, index) }} />
          <span>{item.name}</span>
          <strong>{item.value}</strong>
          <em>{pieShare(item.value, total)}%</em>
        </li>
      ))}
    </ul>
  );
}
function DocumentStatusPies({
  pies,
  chart,
}: {
  pies?: {
    overall: { name: string; value: number }[];
    procedure: { name: string; value: number }[];
    policy: { name: string; value: number }[];
    framework: { name: string; value: number }[];
    other: { name: string; value: number }[];
    counts: {
      procedure: number;
      policy: number;
      framework: number;
      other: number;
    };
  };
  chart: ReturnType<typeof chartTheme>;
}) {
  if (!pies) return null;
  const cards: Array<[string, { name: string; value: number }[], number]> = [
    ["Overall", pies.overall, pies.overall.reduce((sum, item) => sum + item.value, 0)],
    ["Procedures", pies.procedure, pies.counts.procedure],
    ["Policies", pies.policy, pies.counts.policy],
    ["Frameworks", pies.framework, pies.counts.framework],
  ];
  if (pies.counts.other)
    cards.push(["Other names", pies.other, pies.counts.other]);
  return (
    <div className="dash-doc-pies-wrap">
      <p className="dash-doc-pies-note">
        Procedure, policy, and framework are read from the document name. Each
        pie shows Updated, Outdated, Currently Updating, Non-existent, and For
        Decommissioning.
      </p>
      <div className="dash-doc-pies">
        {cards.map(([title, data, total]) => (
          <div className="dash-doc-pie" key={title}>
            <h3>{title}</h3>
            <p>
              {total} document{total === 1 ? "" : "s"}
            </p>
            <DashboardChart
              kind="pie"
              data={data}
              chart={chart}
              height={176}
              legend={false}
            />
            <DocumentPieLegend data={data} total={total} />
          </div>
        ))}
      </div>
    </div>
  );
}
function DashboardChart({
  kind,
  data,
  chart,
  height = 280,
  legend = true,
}: {
  kind: "bar" | "hbar" | "donut" | "pie";
  data: { name: string; value: number }[];
  chart: ReturnType<typeof chartTheme>;
  height?: number;
  legend?: boolean;
}) {
  if (!data.length)
    return <p className="empty-state">No data for this chart yet.</p>;
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const tooltip = {
    background: chart.tooltipBg,
    border: `1px solid ${chart.tooltipBorder}`,
    color: chart.tooltipColor,
    borderRadius: 8,
  };
  if (kind === "donut" || kind === "pie") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={kind === "pie" ? 0 : 58}
            outerRadius={kind === "pie" ? 74 : 92}
            paddingAngle={2}
            stroke={chart.tooltipBg}
            label={kind === "pie" ? pieCountLabel : false}
            labelLine={false}
          >
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={chartColor(entry.name, index)} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={tooltip}
            formatter={(value, name) => [
              `${Number(value || 0)} (${pieShare(Number(value || 0), total)}%)`,
              String(name),
            ]}
          />
          {legend ? (
            <Legend
              wrapperStyle={{ color: chart.tick, fontSize: 12 }}
              iconType="circle"
            />
          ) : null}
        </PieChart>
      </ResponsiveContainer>
    );
  }
  const vertical = kind === "hbar";
  return (
    <ResponsiveContainer width="100%" height={vertical ? 300 : 260}>
      <BarChart data={data} layout={vertical ? "vertical" : "horizontal"}>
        <CartesianGrid stroke={chart.grid} strokeDasharray="3 3" />
        {vertical ? (
          <>
            <XAxis type="number" allowDecimals={false} tick={{ fill: chart.tick, fontSize: 11 }} />
            <YAxis
              type="category"
              dataKey="name"
              width={128}
              tick={{ fill: chart.tick, fontSize: 11 }}
            />
          </>
        ) : (
          <>
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: chart.tick }} interval={0} />
            <YAxis allowDecimals={false} tick={{ fill: chart.tick }} />
          </>
        )}
        <Tooltip contentStyle={tooltip} cursor={{ fill: "transparent" }} />
        <Bar dataKey="value" radius={vertical ? [0, 5, 5, 0] : [5, 5, 0, 0]} maxBarSize={42}>
          {data.map((entry, index) => (
            <Cell key={entry.name} fill={chartColor(entry.name, index)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
function Page({ title, subtitle, actions, children }: any) {
  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}
function formatDate(value: string | null | undefined) {
  if (!value) return "No target date";
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
function Badge({ text }: any) {
  return <span className={badgeClass(text)}>{text}</span>;
}

const tpsaStatusOptions = [
  "Draft",
  "Ready to Send",
  "Sent",
  "Awaiting Vendor Submission",
  "Submitted",
  "Under Cybersecurity Review",
  "Clarification Required",
  "Additional Evidence Required",
  "Remediation Required",
  "Pending Risk Acceptance",
  "Pending Reassessment",
  "Conditionally Completed",
  "Completed",
  "Suspended",
  "Archived",
];
const tpsaVerdictOptions = [
  "Pending",
  "Passed",
  "Reassessment Required",
  "Security Assessment Failed",
];
const removedTpsaFields = new Set([
  "vendorLegalEntity",
  "businessCriticality",
  "tierAssignedBy",
  "tierAssignmentDate",
  "assessmentReason",
  "reviewStartDate",
  "reviewDeadline",
  "reviewCompletedDate",
  "nextFollowUpDate",
  "nextReassessmentDate",
  "reviewDaysRemaining",
  "reassessmentDaysRemaining",
]);
const tpsaExportRows = (rows: any[]) =>
  rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).filter(([key]) => !removedTpsaFields.has(key)),
    ),
  );
const tpsaFields: any[] = [
  [
    "General Information",
    [
      ["vendorName", "Vendor name", "text", null, true],
      ["productService", "Product or service", "text", null, true],
      ["businessProcessOwner", "Business process owner", "text"],
      ["department", "Department", "text"],
      ["reviewerName", "Assigned cybersecurity reviewer", "text", null, true],
      [
        "vendorType",
        "Vendor type",
        "select",
        ["New Vendor", "Existing Vendor"],
      ],
      ["remarks", "General remarks", "textarea"],
    ],
  ],
  [
    "Assessment Information",
    [
      [
        "vendorTier",
        "Vendor tier",
        "select",
        [
          "Not Yet Assigned",
          "Tier 1 – Critical",
          "Tier 2 – High",
          "Tier 3 – Standard",
        ],
      ],
      ["tierJustification", "Tier justification", "textarea"],
      [
        "assessmentType",
        "Assessment type",
        "select",
        [
          "Not Yet Determined",
          "Certification-Based Review",
          "Expedited TPSA",
          "Scoped TPSA",
          "Full TPSA",
          "Evidence-Based Reassessment",
          "Scoped Reassessment",
          "Full Reassessment",
        ],
      ],
      ["status", "Current status", "select", tpsaStatusOptions],
      ["assessmentScope", "Assessment scope", "textarea"],
      ["requiredEvidenceReceived", "Required evidence received", "checkbox"],
      [
        "cybersecurityReviewCompleted",
        "Cybersecurity review completed",
        "checkbox",
      ],
      ["verdict", "Final verdict", "select", tpsaVerdictOptions],
      ["verdictDate", "Verdict date", "date"],
      ["verdictIssuedBy", "Verdict issued by", "text"],
      ["verdictJustification", "Verdict justification", "textarea"],
      ["conditionsRestrictions", "Conditions or restrictions", "textarea"],
    ],
  ],
  [
    "Timeline",
    [
      ["sentDate", "Date TPSA sent", "date"],
      ["submissionDeadline", "Vendor submission deadline", "date"],
      ["submittedDate", "Date submitted", "date"],
      ["remediationDeadline", "Remediation deadline", "date"],
      ["lastFollowUpDate", "Last follow-up date", "date"],
    ],
  ],
  [
    "Findings Summary",
    [
      ["openCriticalFindings", "Open Critical findings", "number"],
      ["openHighFindings", "Open High findings", "number"],
      ["openMediumFindings", "Open Medium findings", "number"],
      ["openLowFindings", "Open Low findings", "number"],
      [
        "highFindingsTreatmentStatus",
        "High findings treated",
        "select",
        [
          "Not Applicable",
          "Pending",
          "Remediated",
          "Mitigated",
          "Risk Accepted",
          "Partially Treated",
        ],
      ],
      ["findingsSummary", "Findings summary", "textarea"],
      ["compensatingControls", "Compensating controls", "textarea"],
      ["remediationNotes", "Remediation notes", "textarea"],
    ],
  ],
  [
    "RAF / Risk Acceptance",
    [
      [
        "rafStatus",
        "RAF status",
        "select",
        [
          "Not Required",
          "Not Yet Submitted",
          "Pending Approval",
          "Approved",
          "Rejected",
          "Expired",
        ],
      ],
      ["rafLink", "RAF link", "url"],
      ["rafApprovalDate", "RAF approval date", "date"],
      ["rafExpirationDate", "RAF expiration date", "date"],
      ["rafApprovingAuthority", "RAF approving authority", "text"],
      ["rafConditions", "RAF conditions", "textarea"],
      ["rafNotes", "RAF notes", "textarea"],
    ],
  ],
  [
    "Documents and Links",
    [
      ["questionnaireLink", "TPSA questionnaire link", "url"],
      ["evidenceFolderLink", "Evidence folder link", "url"],
      ["assessmentReportLink", "Assessment report link", "url"],
      ["otherDocumentLink", "Other supporting document link", "url"],
    ],
  ],
];
const tpsaDefaults: any = {
  vendorType: "New Vendor",
  vendorTier: "Not Yet Assigned",
  assessmentType: "Not Yet Determined",
  status: "Draft",
  verdict: "Pending",
  requiredEvidenceReceived: false,
  cybersecurityReviewCompleted: false,
  openCriticalFindings: 0,
  openHighFindings: 0,
  openMediumFindings: 0,
  openLowFindings: 0,
  highFindingsTreatmentStatus: "Not Applicable",
  rafStatus: "Not Required",
};
const tpsaColumns: any[] = [
  ["select", ""],
  ["tpsaReference", "TPSA ID"],
  ["vendorName", "Vendor Name"],
  ["productService", "Product or Service"],
  ["businessProcessOwner", "Business Process Owner"],
  ["department", "Department"],
  ["reviewerName", "Reviewer"],
  ["vendorType", "Vendor Type"],
  ["vendorTier", "Vendor Tier"],
  ["assessmentType", "Assessment Type"],
  ["status", "Current Status", "badge"],
  ["sentDate", "Date TPSA Sent", "date"],
  ["submissionDeadline", "Submission Deadline", "date"],
  ["submittedDate", "Date Submitted", "date"],
  ["daysOutstanding", "Days Outstanding"],
  ["daysOverdue", "Days Overdue"],
  ["verdict", "Final Verdict", "badge"],
  ["openCriticalFindings", "Critical", "severity"],
  ["openHighFindings", "High", "severity"],
  ["openMediumFindings", "Medium"],
  ["openLowFindings", "Low"],
  ["remediationDeadline", "Remediation Deadline", "date"],
  ["rafStatus", "RAF Status", "badge"],
  ["rafLink", "RAF Link", "link"],
  ["certificationCount", "Certifications"],
  [
    "earliestCertificationExpirationDate",
    "Earliest Certification Expiration",
    "date",
  ],
  ["lastFollowUpDate", "Last Follow-Up", "date"],
  ["nextAction", "Next Action"],
  ["updatedAt", "Last Updated", "date"],
  ["actions", "Actions"],
];

function TpsaMonitoring() {
  const [rows, setRows] = useState<any[]>([]),
    [summary, setSummary] = useState<any>({ cards: {}, attention: [] }),
    [search, setSearch] = useState(""),
    [filters, setFilters] = useState<any>({}),
    [quick, setQuick] = useState(""),
    [archived, setArchived] = useState(false),
    [edit, setEdit] = useState<any>(null),
    [detail, setDetail] = useState<any>(null),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [selected, setSelected] = useState<number[]>([]),
    [page, setPage] = useState(1),
    [meta, setMeta] = useState<any>({ total: 0, totalPages: 1, facets: {} });
  const [theme] = useTheme();
  const chart = chartTheme(theme);
  const defaultVisible = [
    "select",
    "tpsaReference",
    "vendorName",
    "productService",
    "vendorTier",
    "assessmentType",
    "status",
    "submissionDeadline",
    "daysOverdue",
    "verdict",
    "openCriticalFindings",
    "openHighFindings",
    "rafStatus",
    "certificationCount",
    "nextAction",
    "actions",
  ];
  const [visible, setVisible] = useState<string[]>(() => {
    try {
      return (
        JSON.parse(localStorage.getItem("tpsa-columns") || "null") ||
        defaultVisible
      );
    } catch {
      return defaultVisible;
    }
  });
  const buildParams = (targetPage: number, pageSize: number) => {
    const params = new URLSearchParams({
      search,
      archived: String(archived),
      page: String(targetPage),
      pageSize: String(pageSize),
      quick,
    });
    for (const [key, selected] of Object.entries(filters))
      if (selected) params.set(key, String(selected));
    return params;
  };
  const load = async () => {
    const params = buildParams(page, 15);
    const [list, totals] = await Promise.all([
      api(`/tpsa-records?${params}`),
      api("/tpsa-records/summary"),
    ]);
    setRows(list.data);
    setMeta(list.meta);
    setSummary(totals.data);
    setSelected([]);
  };
  useEffect(() => {
    void load();
  }, [search, archived, filters, quick, page]);
  useEffect(() => setPage(1), [filters, quick, search]);
  const paged = rows,
    pages = meta.totalPages;
  const options = (key: string) => meta.facets?.[key] || [];
  const exportCurrent = async () => {
    if (selected.length) {
      csv(
        tpsaExportRows(rows.filter((row) => selected.includes(row.id))),
        "TPSA Monitoring",
      );
      return;
    }
    const first = await api(`/tpsa-records?${buildParams(1, 100)}`);
    const all = [...first.data];
    for (
      let targetPage = 2;
      targetPage <= first.meta.totalPages;
      targetPage++
    ) {
      const response = await api(
        `/tpsa-records?${buildParams(targetPage, 100)}`,
      );
      all.push(...response.data);
    }
    csv(tpsaExportRows(all), "TPSA Monitoring");
  };
  const save = async (event: any) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget),
      data: any = {};
    for (const [, fields] of tpsaFields)
      for (const [name, , type] of fields) {
        const raw = form.get(name);
        data[name] =
          type === "checkbox"
            ? form.has(name)
            : type === "number"
              ? Number(raw || 0)
              : raw || null;
      }
    if (edit?.id) {
      const verdictChanged = edit.verdict !== data.verdict;
      const tierChanged = edit.vendorTier !== data.vendorTier;
      const deadlineExtended = [
        "submissionDeadline",
        "remediationDeadline",
      ].some(
        (field) =>
          edit[field] &&
          data[field] &&
          new Date(data[field]) > new Date(edit[field]),
      );
      const auditReason = String(form.get("changeReason") || "").trim();
      const applicableJustifications = [
        verdictChanged && data.verdictJustification
          ? `Verdict: ${data.verdictJustification}`
          : "",
        tierChanged && data.tierJustification
          ? `Tier: ${data.tierJustification}`
          : "",
      ].filter(Boolean);
      const changeReason = auditReason || applicableJustifications.join("; ");
      if (
        (verdictChanged || tierChanged || deadlineExtended) &&
        !changeReason
      ) {
        setError(
          "Enter a verdict justification, tier justification, or change reason for this update.",
        );
        setSaving(false);
        return;
      }
      if (changeReason) data.changeReason = changeReason;
      if (edit.rafLink && data.rafLink && edit.rafLink !== data.rafLink) {
        if (
          !confirm(
            "Replace the existing RAF link? This change will be recorded in activity history.",
          )
        ) {
          setSaving(false);
          return;
        }
        data.rafLinkReplacementConfirmed = true;
      }
    }
    try {
      await api(`/tpsa-records${edit?.id ? `/${edit.id}` : ""}`, {
        method: edit?.id ? "PUT" : "POST",
        body: JSON.stringify(data),
      });
      setEdit(null);
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to save TPSA record",
      );
    } finally {
      setSaving(false);
    }
  };
  const archive = async (record: any) => {
    if (archived) {
      await api(`/tpsa-records/${record.id}/restore`, { method: "POST" });
    } else {
      const reason = prompt("Enter the reason for archiving this TPSA record:");
      if (!reason) return;
      if (!confirm(`Archive ${record.tpsaReference}?`)) return;
      await api(`/tpsa-records/${record.id}/archive`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    }
    await load();
  };
  const openDetail = async (id: number) => {
    const response = await api(`/tpsa-records/${id}`);
    setDetail(response.data);
  };
  const setColumns = (key: string) =>
    setVisible((current) => {
      const next = current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key];
      localStorage.setItem("tpsa-columns", JSON.stringify(next));
      return next;
    });
  const renderCell = (row: any, column: any) => {
    const [key, , kind] = column;
    if (key === "select")
      return (
        <input
          type="checkbox"
          checked={selected.includes(row.id)}
          onChange={() =>
            setSelected((current) =>
              current.includes(row.id)
                ? current.filter((id) => id !== row.id)
                : [...current, row.id],
            )
          }
        />
      );
    if (key === "actions")
      return (
        <div className="row-actions">
          <ImportanceToggle entityType="tpsa-records" entityId={row.id} />
          <button onClick={() => openDetail(row.id)}>View</button>
          <button onClick={() => setEdit(row)}>Edit</button>
          <button onClick={() => archive(row)}>
            {archived ? "Restore" : "Archive"}
          </button>
        </div>
      );
    if (kind === "date") return formatDate(row[key]);
    if (kind === "badge") return <Badge text={row[key] || "Not Available"} />;
    if (kind === "severity")
      return (
        <span
          className={
            row[key]
              ? `severity ${key.includes("Critical") ? "critical" : "high"}`
              : "severity"
          }
        >
          {row[key] || 0}
        </span>
      );
    if (key === "rafLink")
      return row.rafStatus === "Not Required" ? (
        "Not Required"
      ) : row.rafLink ? (
        <span className="link-actions">
          <a href={row.rafLink} target="_blank" rel="noreferrer">
            Open RAF
          </a>
          <button onClick={() => navigator.clipboard.writeText(row.rafLink)}>
            Copy
          </button>
        </span>
      ) : (
        "Not Available"
      );
    if (key === "certificationCount")
      return row.certificationCount ? (
        <button onClick={() => openDetail(row.id)}>
          View Certifications ({row.certificationCount})
        </button>
      ) : (
        "Not Submitted"
      );
    return String(row[key] ?? "—");
  };
  const cards = [
    ["Total TPSA Records", summary.cards.total, ""],
    ["Ready to Send", summary.cards.readyToSend, "status:Ready to Send"],
    ["TPSA Sent", summary.cards.sent, "status:Sent"],
    [
      "Awaiting Vendor Submission",
      summary.cards.awaitingSubmission,
      "status:Awaiting Vendor Submission",
    ],
    ["Overdue Vendor Submissions", summary.cards.overdueSubmissions, "overdue"],
    ["Submitted", summary.cards.submitted, "status:Submitted"],
    [
      "Under Cybersecurity Review",
      summary.cards.underReview,
      "status:Under Cybersecurity Review",
    ],
    [
      "Clarification Required",
      summary.cards.clarification,
      "status:Clarification Required",
    ],
    [
      "Additional Evidence Required",
      summary.cards.evidence,
      "status:Additional Evidence Required",
    ],
    [
      "Remediation Required",
      summary.cards.remediation,
      "status:Remediation Required",
    ],
    ["Passed", summary.cards.passed, "verdict:Passed"],
    [
      "Reassessment Required",
      summary.cards.reassessment,
      "verdict:Reassessment Required",
    ],
    [
      "Security Assessment Failed",
      summary.cards.assessmentFailed,
      "verdict:Security Assessment Failed",
    ],
    ["Open Critical Findings", summary.cards.critical, "critical"],
    ["Open High Findings", summary.cards.high, "high"],
    [
      "Certifications Expiring ≤90 Days",
      summary.cards.expiringCertifications,
      "cert90",
    ],
  ];
  const progress = summary.progress || {
    readyToSend: 0,
    sent: 0,
    completed: 0,
    completionRate: 0,
  };
  const progressChart = [
    {
      name: "TPSA Progress",
      readyToSend: progress.readyToSend,
      sent: progress.sent,
      completed: progress.completed,
    },
  ];
  return (
    <Page
      title="TPSA Monitoring"
      subtitle="Third-Party Security Assessment operational register"
      actions={
        <div className="actions">
          <button onClick={exportCurrent}>
            Export {selected.length ? "Selected" : "Filtered"}
          </button>
          <button onClick={() => print()}>Print</button>
          <button
            className="primary"
            onClick={() => {
              setError("");
              setEdit({ ...tpsaDefaults });
            }}
          >
            New TPSA Record
          </button>
        </div>
      }
    >
      <div className="kpis tpsa-kpis">
        {cards.map(([label, count, filter]) => (
          <button
            key={label}
            className={`kpi ${quick === filter ? "selected" : ""}`}
            onClick={() => setQuick(filter)}
          >
            <b>{count || 0}</b>
            <span>{label}</span>
          </button>
        ))}
      </div>
      <section className="panel tpsa-progress-panel">
        <div className="tpsa-progress-heading">
          <div>
            <h2>Ready to Send vs. Sent vs. Completed</h2>
            <p>
              Pipeline progress for all active TPSA records ready to send, sent,
              or completed.
            </p>
          </div>
          <strong>{progress.completionRate}% completed</strong>
        </div>
        <div
          className="tpsa-progress-chart"
          role="img"
          aria-label={`${progress.readyToSend} TPSAs ready to send, ${progress.sent} TPSAs sent, and ${progress.completed} TPSAs completed`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={progressChart}
              margin={{ top: 12, right: 18, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                stroke={chart.grid}
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis dataKey="name" tick={{ fill: chart.tick }} />
              <YAxis allowDecimals={false} tick={{ fill: chart.tick }} />
              <Tooltip
                contentStyle={{
                  background: chart.tooltipBg,
                  border: `1px solid ${chart.tooltipBorder}`,
                  color: chart.tooltipColor,
                }}
              />
              <Bar
                dataKey="readyToSend"
                name="Ready to Send"
                fill="#eab308"
                radius={[6, 6, 0, 0]}
              />
              <Bar
                dataKey="sent"
                name="TPSA Sent"
                fill="#16a34a"
                radius={[6, 6, 0, 0]}
              />
              <Bar
                dataKey="completed"
                name="TPSA Completed"
                fill="#2563eb"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="tpsa-progress-legend" aria-hidden="true">
          <span>
            <i className="ready-to-send" /> Ready to Send:{" "}
            {progress.readyToSend}
          </span>
          <span>
            <i className="sent" /> TPSA Sent: {progress.sent}
          </span>
          <span>
            <i className="completed" /> TPSA Completed: {progress.completed}
          </span>
        </div>
      </section>
      <section className="panel attention">
        <h2>Needs Attention</h2>
        {summary.attention?.length ? (
          <div className="attention-grid">
            {summary.attention.map((item: any, index: number) => (
              <button
                key={`${item.id}-${index}`}
                onClick={() => openDetail(item.id)}
              >
                <b>
                  {item.tpsaReference} · {item.vendorName}
                </b>
                <span>{item.reason}</span>
              </button>
            ))}
          </div>
        ) : (
          <p>No TPSA records currently require attention.</p>
        )}
      </section>
      <div className="toolbar tpsa-toolbar">
        <input
          placeholder="Search TPSA ID, vendor, service, owner, department, or reviewer…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <label>
          <input
            type="checkbox"
            checked={archived}
            onChange={(event) => setArchived(event.target.checked)}
          />{" "}
          Archived
        </label>
        <div className="filter-controls">
          {[
            ["vendorTier", "Vendor tier"],
            ["assessmentType", "Assessment type"],
            ["status", "Status"],
            ["verdict", "Verdict"],
            ["reviewerName", "Reviewer"],
            ["rafStatus", "RAF status"],
          ].map(([key, label]) => (
            <label key={key}>
              <span>{label}</span>
              <select
                value={filters[key] || ""}
                onChange={(event) =>
                  setFilters((current: any) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
              >
                <option value="">All</option>
                {options(key).map((option: string) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
          ))}
          <button
            onClick={() => {
              setFilters({});
              setQuick("");
              setSearch("");
            }}
          >
            Clear Filters
          </button>
          <details className="column-picker">
            <summary>Columns</summary>
            <div>
              {tpsaColumns
                .filter((column) => !["select", "actions"].includes(column[0]))
                .map((column) => (
                  <label key={column[0]}>
                    <input
                      type="checkbox"
                      checked={visible.includes(column[0])}
                      onChange={() => setColumns(column[0])}
                    />{" "}
                    {column[1]}
                  </label>
                ))}
            </div>
          </details>
        </div>
      </div>
      <div className="tablewrap">
        <table className="tpsa-table">
          <thead>
            <tr>
              {tpsaColumns
                .filter((column) => visible.includes(column[0]))
                .map((column) => (
                  <th key={column[0]}>{column[1]}</th>
                ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((row) => (
              <tr
                key={row.id}
                className={
                  row.daysOverdue > 0 || row.openCriticalFindings > 0
                    ? "needs-attention-row"
                    : ""
                }
              >
                {tpsaColumns
                  .filter((column) => visible.includes(column[0]))
                  .map((column) => (
                    <td key={column[0]}>{renderCell(row, column)}</td>
                  ))}
              </tr>
            ))}
            {!paged.length && (
              <tr>
                <td colSpan={visible.length} className="empty-state">
                  No TPSA records match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <span>
          {meta.total} records · Page {page} of {pages}
        </span>
        <button disabled={page === 1} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <button disabled={page === pages} onClick={() => setPage(page + 1)}>
          Next
        </button>
      </div>
      {edit && (
        <TpsaForm
          record={edit}
          error={error}
          saving={saving}
          onSave={save}
          onClose={() => setEdit(null)}
        />
      )}
      {detail && (
        <TpsaDetail
          record={detail}
          onClose={() => setDetail(null)}
          onChanged={async () => {
            await load();
            await openDetail(detail.id);
          }}
          onEdit={() => {
            setEdit(detail);
            setDetail(null);
          }}
        />
      )}
    </Page>
  );
}

function TpsaForm({ record, error, saving, onSave, onClose }: any) {
  return (
    <div className="modal">
      <form className="tpsa-form" onSubmit={onSave}>
        <div className="modalhead">
          <div>
            <h2>{record.id ? "Edit" : "New"} TPSA Record</h2>
            {record.tpsaReference && <p>{record.tpsaReference}</p>}
          </div>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>
        {tpsaFields.map(([section, fields]) => (
          <fieldset key={section}>
            <legend>{section}</legend>
            <div className="formgrid">
              {fields.map(([name, label, type, options, required]: any) => (
                <label className={type === "textarea" ? "wide" : ""} key={name}>
                  {type === "checkbox" ? (
                    <>
                      <span>{label}</span>
                      <input
                        name={name}
                        type="checkbox"
                        defaultChecked={Boolean(record[name])}
                      />
                    </>
                  ) : (
                    <>
                      {label}
                      {type === "select" ? (
                        <select
                          name={name}
                          defaultValue={record[name] ?? options[0]}
                          required={required}
                        >
                          {options.map((option: string) => (
                            <option key={option} value={option}>
                              {option || "Select…"}
                            </option>
                          ))}
                        </select>
                      ) : type === "textarea" ? (
                        <textarea
                          name={name}
                          defaultValue={record[name] || ""}
                        />
                      ) : (
                        <input
                          name={name}
                          type={type}
                          required={required}
                          min={type === "number" ? 0 : undefined}
                          defaultValue={
                            type === "date" && record[name]
                              ? String(record[name]).slice(0, 10)
                              : (record[name] ?? "")
                          }
                        />
                      )}
                    </>
                  )}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        {record.id && (
          <fieldset>
            <legend>Change Audit</legend>
            <div className="formgrid">
              <label className="wide">
                Change reason
                <textarea
                  name="changeReason"
                  placeholder="Required for a deadline extension when no applicable justification is entered above"
                />
                <span className="field-hint">
                  Verdict justification and tier justification are used
                  automatically for their respective changes.
                </span>
              </label>
            </div>
          </fieldset>
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="actions sticky-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save TPSA Record"}
          </button>
        </div>
      </form>
    </div>
  );
}

function TpsaDetail({ record, onClose, onChanged, onEdit }: any) {
  const { user } = useAuth();
  const [cert, setCert] = useState(false),
    [follow, setFollow] = useState(false),
    [localError, setLocalError] = useState("");
  const addCertification = async (event: any) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const data: any = Object.fromEntries(form);
    for (const key of ["issueDate", "expirationDate", "reviewDate"])
      data[key] ||= null;
    try {
      await api(`/tpsa-records/${record.id}/certifications`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      setCert(false);
      onChanged();
    } catch (reason) {
      setLocalError(
        reason instanceof Error
          ? reason.message
          : "Unable to add certification",
      );
    }
  };
  const addFollowUp = async (event: any) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget),
      data: any = Object.fromEntries(form);
    data.responseReceived = form.has("responseReceived");
    delete data.recordedBy;
    try {
      await api(`/tpsa-records/${record.id}/follow-ups`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      setFollow(false);
      onChanged();
    } catch (reason) {
      setLocalError(
        reason instanceof Error ? reason.message : "Unable to record follow-up",
      );
    }
  };
  const duplicate = async () => {
    const trigger = prompt("Reassessment trigger:", "Periodic Review");
    if (!trigger) return;
    const assessmentType = prompt(
      "Assessment type: Evidence-Based Reassessment, Scoped Reassessment, or Full Reassessment",
      "Evidence-Based Reassessment",
    );
    if (!assessmentType) return;
    await api(`/tpsa-records/${record.id}/reassessment`, {
      method: "POST",
      body: JSON.stringify({ trigger, assessmentType }),
    });
    onClose();
  };
  const removeCert = async (id: number) => {
    if (!confirm("Remove this certification record?")) return;
    await api(`/tpsa-certifications/${id}`, { method: "DELETE" });
    onChanged();
  };
  const changeStatus = async (status: string) => {
    if (!confirm(`Change ${record.tpsaReference} status to ${status}?`)) return;
    try {
      await api(`/tpsa-records/${record.id}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      await onChanged();
    } catch (reason) {
      setLocalError(
        reason instanceof Error ? reason.message : "Unable to change status",
      );
    }
  };
  return (
    <div className="modal">
      <div className="detail-drawer">
        <div className="modalhead">
          <div>
            <h2>
              {record.tpsaReference} · {record.vendorName}
            </h2>
            <p>{record.productService}</p>
          </div>
          <ImportanceToggle entityType="tpsa-records" entityId={record.id} />
          <button onClick={onClose}>×</button>
        </div>
        <div className="actions">
          <button onClick={onEdit}>Edit Record</button>
          <button onClick={() => changeStatus("Ready to Send")}>
            Ready to Send
          </button>
          <button onClick={() => changeStatus("Sent")}>Mark Sent</button>
          <button onClick={() => changeStatus("Submitted")}>
            Mark Submitted
          </button>
          <button onClick={() => changeStatus("Under Cybersecurity Review")}>
            Start Review
          </button>
          <button onClick={() => changeStatus("Clarification Required")}>
            Request Clarification
          </button>
          <button onClick={() => changeStatus("Additional Evidence Required")}>
            Request Evidence
          </button>
          <button onClick={() => changeStatus("Remediation Required")}>
            Require Remediation
          </button>
          <button onClick={() => setFollow(!follow)}>Record Follow-Up</button>
          <button onClick={() => setCert(!cert)}>Add Certification</button>
          <button onClick={duplicate}>Duplicate for Reassessment</button>
        </div>
        {localError && <div className="form-error">{localError}</div>}
        {follow && (
          <form className="inline-form" onSubmit={addFollowUp}>
            <h3>New Follow-Up</h3>
            <input name="followUpDate" type="date" required />
            <select name="method">
              <option>Email</option>
              <option>Meeting</option>
              <option>Chat</option>
              <option>Call</option>
              <option>Internal Coordination</option>
              <option>Other</option>
            </select>
            <input name="personContacted" placeholder="Person contacted" />
            <input
              name="organizationDepartment"
              placeholder="Organization / department"
            />
            <textarea name="notes" placeholder="Follow-up notes" />
            <label>
              <input name="responseReceived" type="checkbox" /> Response
              received
            </label>
            <textarea name="responseSummary" placeholder="Response summary" />
            <p>Recorded by {user?.displayName}</p>
            <button className="primary">Save Follow-Up</button>
          </form>
        )}
        {cert && (
          <form className="inline-form" onSubmit={addCertification}>
            <h3>New Certification</h3>
            <select name="certificationType">
              <option>ISO/IEC 27001 Certificate</option>
              <option>Statement of Applicability</option>
              <option>SOC 2 Type II Report</option>
              <option>SOC 3 Report</option>
              <option>PCI DSS Attestation of Compliance</option>
              <option>Penetration Testing Report</option>
              <option>Independent Security Assessment</option>
              <option>Cloud Security Certification</option>
              <option>Other</option>
            </select>
            <input name="documentName" placeholder="Document name" required />
            <input name="url" type="url" placeholder="https://…" required />
            <input
              name="issuingOrganization"
              placeholder="Issuing organization"
            />
            <label>
              Issue date
              <input name="issueDate" type="date" />
            </label>
            <label>
              Expiration date
              <input name="expirationDate" type="date" />
            </label>
            <select name="reviewStatus">
              <option>Pending Review</option>
              <option>Valid and Accepted</option>
              <option>Partially Accepted</option>
              <option>Expiring Soon</option>
              <option>Expired</option>
              <option>Out of Scope</option>
              <option>Rejected</option>
            </select>
            <textarea name="scopeNotes" placeholder="Scope notes" />
            <input name="reviewedBy" placeholder="Reviewed by" />
            <input name="reviewDate" type="date" />
            <textarea name="reviewNotes" placeholder="Review notes" />
            <button className="primary">Save Certification</button>
          </form>
        )}
        <div className="detail-grid">
          <section>
            <h3>Overview</h3>
            <dl>
              <dt>Status</dt>
              <dd>
                <Badge text={record.status} />
              </dd>
              <dt>Vendor tier</dt>
              <dd>{record.vendorTier}</dd>
              <dt>Assessment type</dt>
              <dd>{record.assessmentType}</dd>
              <dt>Final verdict</dt>
              <dd>{record.verdict}</dd>
              <dt>Reviewer</dt>
              <dd>{record.reviewerName}</dd>
              <dt>Next action</dt>
              <dd>{record.nextAction}</dd>
            </dl>
          </section>
          <section>
            <h3>Timeline</h3>
            <dl>
              <dt>TPSA sent</dt>
              <dd>{formatDate(record.sentDate)}</dd>
              <dt>Submission deadline</dt>
              <dd>{formatDate(record.submissionDeadline)}</dd>
              <dt>Days overdue</dt>
              <dd>{record.daysOverdue ?? "—"}</dd>
            </dl>
          </section>
          <section>
            <h3>Findings</h3>
            <div className="finding-counts">
              <Badge text={`Critical ${record.openCriticalFindings}`} />
              <Badge text={`High ${record.openHighFindings}`} />
              <Badge text={`Medium ${record.openMediumFindings}`} />
              <Badge text={`Low ${record.openLowFindings}`} />
            </div>
            <p>{record.findingsSummary || "No findings summary."}</p>
          </section>
          <section>
            <h3>RAF</h3>
            <p>
              <Badge text={record.rafStatus} />
            </p>
            {record.rafLink && (
              <p className="link-actions">
                <a href={record.rafLink} target="_blank" rel="noreferrer">
                  Open RAF
                </a>
                <button
                  onClick={() => navigator.clipboard.writeText(record.rafLink)}
                >
                  Copy Link
                </button>
              </p>
            )}
            <p>Expiration: {formatDate(record.rafExpirationDate)}</p>
          </section>
        </div>
        <section>
          <h3>Certifications</h3>
          {record.certifications.length ? (
            record.certifications.map((item: any) => (
              <div className="related-item" key={item.id}>
                <div>
                  <b>{item.documentName}</b>
                  <span>
                    {item.certificationType} · {item.expirationClassification}
                  </span>
                </div>
                <div className="actions">
                  <a href={item.url} target="_blank" rel="noreferrer">
                    Open Link
                  </a>
                  <button
                    onClick={() => navigator.clipboard.writeText(item.url)}
                  >
                    Copy Link
                  </button>
                  <button onClick={() => removeCert(item.id)}>Remove</button>
                </div>
              </div>
            ))
          ) : (
            <p>No certifications submitted.</p>
          )}
        </section>
        <section>
          <h3>Follow-Up History</h3>
          {record.followUps.length ? (
            record.followUps.map((item: any) => (
              <div className="related-item" key={item.id}>
                <div>
                  <b>
                    {formatDate(item.followUpDate)} · {item.method}
                  </b>
                  <span>{item.personContacted || "Contact not specified"}</span>
                  <p>{item.notes}</p>
                </div>
              </div>
            ))
          ) : (
            <p>No follow-ups recorded.</p>
          )}
        </section>
      </div>
    </div>
  );
}
function ActivityPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState("all");
  useEffect(() => {
    api("/activity-log")
      .then((x) => {
        setRows(x.data);
        setColumns(x.meta?.columns || Object.keys(x.data[0] || {}));
      })
      .catch((reason) =>
        setError(
          reason instanceof Error ? reason.message : "Unable to load activity",
        ),
      );
  }, []);
  const visible =
    outcome === "all"
      ? rows
      : rows.filter(
          (row) => String(row.outcome || "").toLowerCase() === outcome,
        );
  return (
    <Page
      title="Activity Log"
      subtitle="Columnar audit events. Download CSV with the same headers."
      actions={
        <button
          className="primary"
          onClick={() =>
            downloadActivityCsv().catch((reason) =>
              setError(
                reason instanceof Error
                  ? reason.message
                  : "Unable to download CSV",
              ),
            )
          }
        >
          Download CSV
        </button>
      }
    >
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <section className="panel">
        <div className="actions" style={{ marginBottom: 12 }}>
          <label>
            Outcome
            <select
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
            >
              <option value="all">All</option>
              <option value="success">Success</option>
              <option value="failure">Failure</option>
            </select>
          </label>
        </div>
        <div className="tablewrap activity-table">
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row, index) => (
                <tr
                  key={row.timestamp + row.action + row.target_id + index}
                  className={
                    String(row.outcome || "").toLowerCase() === "failure"
                      ? "activity-failure"
                      : undefined
                  }
                >
                  {columns.map((column) => (
                    <td key={column}>{row[column] || "—"}</td>
                  ))}
                </tr>
              ))}
              {!visible.length && (
                <tr>
                  <td colSpan={Math.max(columns.length, 1)} className="empty-state">
                    {outcome === "failure"
                      ? "No failed events recorded yet."
                      : "No activity recorded yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </Page>
  );
}
function formatWindow(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  if (ms % 3_600_000 === 0) {
    const hours = ms / 3_600_000;
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  if (ms % 60_000 === 0) {
    const minutes = ms / 60_000;
    return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  }
  const seconds = Math.max(1, Math.round(ms / 1000));
  return seconds === 1 ? "1 second" : `${seconds} seconds`;
}
function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";
  const [info, setInfo] = useState<any>();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const load = () =>
    api("/settings/database").then((response) => setInfo(response.data));
  useEffect(() => {
    void load();
  }, []);
  const run = async (label: string, work: () => Promise<void>) => {
    setBusy(label);
    setError("");
    setMessage("");
    try {
      await work();
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to complete backup",
      );
    } finally {
      setBusy("");
    }
  };
  const bytes = (value: number) =>
    value >= 1_048_576
      ? `${(value / 1_048_576).toFixed(1)} MB`
      : `${Math.max(1, Math.round(value / 1024))} KB`;
  return (
    <Page
      title="Settings"
      subtitle="Local database location, snapshots, restore, and access controls"
    >
      <section className="panel">
        <h2>Appearance</h2>
        <p>
          Choose light mode or night mode. The selection is saved on this
          computer and applies across the dashboard.
        </p>
        <ThemeToggle />
      </section>
      {info?.session && (
        <section className="panel">
          <h2>Sessions</h2>
          <p>
            A signed-in session lasts {formatWindow(info.session.ttlMs)} of
            inactivity and at most{" "}
            {formatWindow(info.session.absoluteTtlMs)}. While you keep using
            DaxGov, it can renew after{" "}
            {formatWindow(info.session.slideAfterMs)}. Signing in again ends
            any earlier session for the same account. Changing your password
            issues a new session and signs out other devices.
          </p>
        </section>
      )}
      {info?.rateLimits && (
        <section className="panel">
          <h2>Rate limiting</h2>
          <p>
            These controls slow brute-force and automated traffic. Change the
            environment variables and restart the API to adjust them.
          </p>
          <div className="tablewrap" style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Control</th>
                  <th>Limit</th>
                  <th>Window</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Failed password sign-in</td>
                  <td>{info.rateLimits.login.limit} attempts</td>
                  <td>{formatWindow(info.rateLimits.login.windowMs)}</td>
                </tr>
                <tr>
                  <td>Account lock after failed sign-ins</td>
                  <td>{info.rateLimits.accountLock.failures} failures</td>
                  <td>{formatWindow(info.rateLimits.accountLock.lockMs)}</td>
                </tr>
                <tr>
                  <td>Password change</td>
                  <td>{info.rateLimits.passwordChange.limit} attempts</td>
                  <td>
                    {formatWindow(info.rateLimits.passwordChange.windowMs)}
                  </td>
                </tr>
                <tr>
                  <td>JumpCloud SSO start and callback</td>
                  <td>{info.rateLimits.sso.limit} attempts</td>
                  <td>{formatWindow(info.rateLimits.sso.windowMs)}</td>
                </tr>
                <tr>
                  <td>All API requests</td>
                  <td>{info.rateLimits.api.limit} requests</td>
                  <td>{formatWindow(info.rateLimits.api.windowMs)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}
      <section className="panel">
        <h2>Application</h2>
        <p>
          {info?.fileBackups === false
            ? "DaxGov is using Aurora Serverless. File snapshots stay on SQLite; Aurora backups are managed in AWS Secrets Manager and RDS snapshots."
            : "DaxGov runs locally. Data remains in the SQLite database on this computer."}
        </p>
        <p>
          {window.location.port === "5173"
            ? "API: localhost:5174 · UI: localhost:5173"
            : "The UI and API are served from this address as a single-page application."}
        </p>
        {info && (
          <p>
            <b>Database:</b>{" "}
            {info.fileBackups === false
              ? `${info.label}${info.host ? ` · ${info.host}` : ""}${
                  info.database ? ` / ${info.database}` : ""
                }`
              : `${info.fileName || "governance.db"} · ${bytes(info.sizeBytes)} · updated ${new Date(
                  info.updatedAt,
                ).toLocaleString()}`}
          </p>
        )}
      </section>
      <section className="panel">
        <h2>Backup and restore</h2>
        {info?.fileBackups === false ? (
          <p>
            File backup and restore are disabled while the app is pointed at
            Aurora Serverless. Use Aurora snapshots and point-in-time recovery
            in AWS.
          </p>
        ) : !isAdmin ? (
          <p>
            Database snapshots, downloads, and restore are limited to
            Administrators.
          </p>
        ) : (
          <>
        <p>
          Create a snapshot before experiments. Restore replaces the live
          database and asks for your password. The current database is
          snapshotted automatically before an uploaded restore.
        </p>
        <div className="actions">
          <button
            className="primary"
            disabled={Boolean(busy)}
            onClick={() =>
              run("snapshot", async () => {
                const response = await api("/settings/backup", {
                  method: "POST",
                });
                setMessage(
                  `Saved ${response.data.fileName}${
                    response.data.sha256
                      ? ` (${String(response.data.sha256).slice(0, 12)}…)`
                      : ""
                  }.`,
                );
              })
            }
          >
            {busy === "snapshot" ? "Saving…" : "Save snapshot"}
          </button>
          <label className="file-button">
            Restore from file
            <input
              type="file"
              accept=".db,.sqlite"
              disabled={Boolean(busy)}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                const password = window.prompt(
                  `Restore ${file.name}? Enter your password to confirm. Current records will be replaced after an automatic snapshot.`,
                );
                if (!password) return;
                void run("upload", async () => {
                  await uploadRestore(file, password);
                  setMessage("Database restored from the uploaded file.");
                  window.location.reload();
                });
              }}
            />
          </label>
        </div>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        {message && <p className="settings-message">{message}</p>}
        <div className="tablewrap" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Snapshot</th>
                <th>Created</th>
                <th>Size</th>
                <th>Checksum</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(info?.snapshots || []).map((snapshot: any) => (
                <tr key={snapshot.fileName}>
                  <td>{snapshot.fileName}</td>
                  <td>{new Date(snapshot.createdAt).toLocaleString()}</td>
                  <td>{bytes(snapshot.sizeBytes)}</td>
                  <td>
                    {snapshot.sha256
                      ? String(snapshot.sha256).slice(0, 12) + "…"
                      : "—"}
                  </td>
                  <td>
                    <button
                      disabled={Boolean(busy)}
                      onClick={() =>
                        run("download", () =>
                          downloadBackup(snapshot.fileName),
                        )
                      }
                    >
                      Download
                    </button>{" "}
                    <button
                      disabled={Boolean(busy)}
                      onClick={() => {
                        const password = window.prompt(
                          `Restore ${snapshot.fileName}? Enter your password to confirm. Current records will be replaced.`,
                        );
                        if (!password) return;
                        void run("restore", async () => {
                          await api("/settings/restore", {
                            method: "POST",
                            body: JSON.stringify({
                              fileName: snapshot.fileName,
                              password,
                            }),
                          });
                          setMessage(`Restored ${snapshot.fileName}.`);
                          window.location.reload();
                        });
                      }}
                    >
                      Restore
                    </button>
                  </td>
                </tr>
              ))}
              {!info?.snapshots?.length && (
                <tr>
                  <td colSpan={5} className="empty-state">
                    No snapshots yet. Save one to keep a restore point on this
                    computer.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
          </>
        )}
      </section>
    </Page>
  );
}
export default function App() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="login-screen">
        <p className="login-tagline">Loading DaxGov…</p>
      </div>
    );
  }
  if (!user) return <LoginPage />;
  if (user.mustChangePassword) return <ChangePasswordPage />;
  return (
    <NotificationsProvider>
    <Layout>
      <Routes>
        <Route
          path="/"
          element={
            <PageGuard page="dashboard">
              <Dashboard />
            </PageGuard>
          }
        />
        <Route
          path="/tpsa-monitoring"
          element={
            <PageGuard page="tpsa-monitoring">
              <TpsaMonitoring />
            </PageGuard>
          }
        />
        <Route
          path="/isra"
          element={
            <PageGuard page="isra">
              <IsraPage />
            </PageGuard>
          }
        />
        <Route
          path="/isra/daxon-answers"
          element={
            <PageGuard page="isra">
              <DaxonAnswersPage />
            </PageGuard>
          }
        />
        <Route
          path="/isra-assessment"
          element={
            <PageGuard page="isra-assessment">
              <IsraAssessmentPage />
            </PageGuard>
          }
        />
        <Route
          path="/orca"
          element={
            <PageGuard page="orca">
              <OrcaPage />
            </PageGuard>
          }
        />
        <Route
          path="/kris"
          element={
            <PageGuard page="kris">
              <KriPage />
            </PageGuard>
          }
        />
        <Route
          path="/information-assets"
          element={
            <PageGuard page="information-assets">
              <InformationAssetInventoryPage />
            </PageGuard>
          }
        />
        <Route
          path="/regulatory-guide"
          element={
            <PageGuard page="regulatory-guide">
              <RegulatoryGuidePage />
            </PageGuard>
          }
        />
        {Object.keys(configs).map((k) => (
          <Route
            key={k}
            path={"/" + k}
            element={
              <PageGuard page={k}>
                <RegisterPage type={k} config={configs[k]} />
              </PageGuard>
            }
          />
        ))}
        <Route
          path="/activity-log"
          element={
            <PageGuard page="activity-log">
              <ActivityPage />
            </PageGuard>
          }
        />
        <Route
          path="/users"
          element={
            <AdminOnly>
              <UsersPage />
            </AdminOnly>
          }
        />
        <Route
          path="/user-management"
          element={
            <AdminOnly>
              <UsersPage />
            </AdminOnly>
          }
        />
        <Route
          path="/settings"
          element={
            <PageGuard page="settings">
              <SettingsPage />
            </PageGuard>
          }
        />
        <Route
          path="*"
          element={<Navigate to={firstAllowedPath(user)} replace />}
        />
      </Routes>
    </Layout>
    </NotificationsProvider>
  );
}
