import { useEffect, useState } from "react";
import { api, csv } from "./api";
import { ImportanceToggle } from "./notifications";
import { OrcaKriMappingModal } from "./OrcaKriMapping";
import { badgeClass } from "./theme";
import {
  CoverageWorkspace,
  MonitoringDashboard,
  SubmissionWorkspace,
  useRiskMonitoring,
} from "./KriMonitoringWorkspaces";

const MONTHS = [
  ["jan", "January"],
  ["feb", "February"],
  ["mar", "March"],
  ["apr", "April"],
  ["may", "May"],
  ["jun", "June"],
  ["jul", "July"],
  ["aug", "August"],
  ["sep", "September"],
  ["oct", "October"],
  ["nov", "November"],
  ["dec", "December"],
] as const;

const RESULTS = ["", "Good", "Warning", "Breached"];

const FIELDS: any[] = [
  ["riskCode", "Risk code", "text"],
  ["riskName", "Risk name", "text"],
  ["kriNumber", "Number", "text"],
  ["keyRiskIndicator", "Key risk indicator", "textarea"],
  ["weight", "%", "number"],
  ["breached", "Breached", "textarea"],
  ["warning", "Warning", "textarea"],
  ["good", "Good", "textarea"],
  ...MONTHS.flatMap(([key, label]) => [
    [`${key}Result`, `${label} result`, "select", RESULTS],
    [`${key}Remarks`, `${label} remarks`, "textarea"],
  ]),
];

const DEFAULT_VISIBLE = [
  "riskCode",
  "riskName",
  "kriNumber",
  "keyRiskIndicator",
  "weight",
  "orcaSources",
  "breached",
  "warning",
  "good",
  ...MONTHS.flatMap(([key]) => [`${key}Result`, `${key}Remarks`]),
];

function Badge({ text }: { text: string }) {
  return <span className={badgeClass(text)}>{text}</span>;
}

export default function KriPage() {
  const [sheets, setSheets] = useState<any[]>([]);
  const [year, setYear] = useState<number | "">("");
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [mapping, setMapping] = useState<{
    side: "kri" | "orca";
    kriId?: number;
  } | null>(null);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [expanded, setExpanded] = useState<number[]>([]);
  const [workspace, setWorkspace] = useState<
    "register" | "dashboard" | "coverage" | "submit"
  >("dashboard");
  const monitoring = useRiskMonitoring();
  const [visible, setVisible] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("columns-kris") || "null") || DEFAULT_VISIBLE;
    } catch {
      return DEFAULT_VISIBLE;
    }
  });
  const [error, setError] = useState("");

  const currentSheet = sheets.find((sheet) => sheet.year === year);
  const activeSheet = sheets.find((sheet) => sheet.status === "Active");

  const loadSheets = async () => {
    const response = await api("/kri-sheets");
    const list = response.data || [];
    setSheets(list);
    setYear((current) => {
      if (current && list.some((sheet: any) => sheet.year === current)) return current;
      return list.find((sheet: any) => sheet.status === "Active")?.year || list[0]?.year || "";
    });
  };

  const load = async (targetYear = year) => {
    if (!targetYear) return;
    const params = new URLSearchParams({
      year: String(targetYear),
      search,
      archived: String(archived),
      page: "1",
      pageSize: "50",
    });
    const response = await api(`/kri-records?${params}`);
    setRows(response.data || []);
    setSelected([]);
  };

  useEffect(() => {
    void loadSheets().catch((reason) =>
      setError(reason instanceof Error ? reason.message : "Unable to load KRI sheets"),
    );
  }, []);

  useEffect(() => {
    if (!year) return;
    void load(year).catch((reason) =>
      setError(reason instanceof Error ? reason.message : "Unable to load KRIs"),
    );
  }, [year, search, archived]);

  const tableFields = [
    ...FIELDS.slice(0, 4),
    ["orcaSources", "ORCA sources", "mapping"],
    ...FIELDS.slice(4),
  ];
  const shown = tableFields.filter((field) => visible.includes(field[0]));
  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.id));
  const toggleSelected = (id: number) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  const toggleExpanded = (id: number) =>
    setExpanded((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  const setColumns = (key: string) =>
    setVisible((current) => {
      const next = current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key];
      localStorage.setItem("columns-kris", JSON.stringify(next));
      return next;
    });

  const save = async (event: any) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFormError("");
    const form = new FormData(event.currentTarget);
    const data: any = { year };
    if (!edit?.id) {
      data.sortOrder =
        rows.reduce((max, row) => Math.max(max, row.sortOrder || 0), 0) + 1;
    }
    for (const [name, , kind] of FIELDS) {
      let value: any = form.get(name);
      if (kind === "number") value = value === "" ? null : Number(value);
      data[name] = value || null;
    }
    try {
      await api(`/kri-records${edit?.id ? "/" + edit.id : ""}`, {
        method: edit?.id ? "PUT" : "POST",
        body: JSON.stringify(data),
      });
      setEdit(null);
      setToast("Saved successfully");
      await load();
      setTimeout(() => setToast(""), 2500);
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Unable to save the KRI");
    } finally {
      setSubmitting(false);
    }
  };

  const archiveRow = async (row: any) => {
    if (!confirm(`${archived ? "Restore" : "Archive"} this KRI?`)) return;
    await api(`/kri-records/${row.id}/${archived ? "restore" : "archive"}`, {
      method: "POST",
    });
    await load();
  };

  const rollover = async () => {
    if (!year) return;
    const nextYear = Number(year) + 1;
    if (
      !confirm(
        `Archive the ${year} KRI sheet and start a blank ${nextYear} sheet? Monthly results stay saved on ${year}. KRI definitions and ORCA mappings copy to ${nextYear} with empty month results.`,
      )
    )
      return;
    setError("");
    try {
      await api("/kri-sheets/rollover", {
        method: "POST",
        body: JSON.stringify({ fromYear: year, toYear: nextYear }),
      });
      setToast(`Archived ${year} and opened ${nextYear}`);
      await loadSheets();
      setYear(nextYear);
      setTimeout(() => setToast(""), 2500);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to archive the year");
    }
  };

  const renderCell = (row: any, field: any[]) => {
    const [key, , kind] = field;
    if (key === "orcaSources") {
      const labels = (row.orcaRisks || [])
        .map((item: any) => item.riskNo)
        .filter(Boolean);
      return labels.length ? labels.join(", ") : "Not mapped";
    }
    const value = row[key];
    if (key.endsWith("Result") && value) return <Badge text={value} />;
    if (kind === "number") return value == null || value === "" ? "—" : String(value);
    if (value == null || value === "") return "—";
    return String(value);
  };

  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <h1>KRIs</h1>
          <p>
            {currentSheet
              ? `${currentSheet.year} ${currentSheet.status.toLowerCase()} sheet · ${rows.length} indicators`
              : "Cyber Security key risk indicators"}
          </p>
        </div>
        <div className="actions">
          <button
            type="button"
            className={workspace === "register" ? "primary" : ""}
            onClick={() => setWorkspace("register")}
          >
            Year sheet
          </button>
          <button type="button" onClick={() => setMapping({ side: "kri" })}>
            Mapping
          </button>
          <button onClick={() => csv(rows, `KRIs ${year}`)}>Export CSV</button>
          {currentSheet?.status === "Active" && (
            <button type="button" onClick={() => void rollover()}>
              Archive year and start {Number(year || 0) + 1}
            </button>
          )}
          {currentSheet?.status === "Active" && (
            <button
              className="primary"
              onClick={() => {
                setFormError("");
                setEdit({});
              }}
            >
              Add KRI
            </button>
          )}
        </div>
      </div>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {monitoring.error && workspace !== "register" && (
        <div className="form-error" role="alert">
          {monitoring.error}
        </div>
      )}
      <div className="kri-hub" role="tablist" aria-label="KRI monitoring workspaces">
        <button
          type="button"
          className={workspace === "dashboard" ? "kri-hub-btn active" : "kri-hub-btn"}
          onClick={() => setWorkspace("dashboard")}
        >
          <span className="kri-hub-kicker">Workspace 1</span>
          <span className="kri-hub-title">Management Risk Monitoring Status</span>
          <span className="kri-hub-desc">
            Coverage, breaches, overdue submissions, and charts for ManCom.
          </span>
        </button>
        <button
          type="button"
          className={workspace === "coverage" ? "kri-hub-btn active" : "kri-hub-btn"}
          onClick={() => setWorkspace("coverage")}
        >
          <span className="kri-hub-kicker">Workspace 2</span>
          <span className="kri-hub-title">ORCA — with monitoring columns</span>
          <span className="kri-hub-desc">
            Coverage view of ORCA risks. The ORCA page itself stays unchanged.
          </span>
        </button>
        <button
          type="button"
          className={workspace === "submit" ? "kri-hub-btn active" : "kri-hub-btn"}
          onClick={() => setWorkspace("submit")}
        >
          <span className="kri-hub-kicker">Workspace 3</span>
          <span className="kri-hub-title">KRI submission — enter actual result</span>
          <span className="kri-hub-desc">
            Type the number. DaxGov calculates Good / Warning / Breached.
          </span>
        </button>
      </div>
      {workspace === "dashboard" && (
        <MonitoringDashboard
          data={monitoring.dashboard}
          onOpenCoverage={() => setWorkspace("coverage")}
        />
      )}
      {workspace === "coverage" && (
        <CoverageWorkspace
          rows={monitoring.coverage}
          summary={monitoring.summary}
          year={year}
          onReload={monitoring.load}
        />
      )}
      {workspace === "submit" && (
        <SubmissionWorkspace
          rows={monitoring.coverage}
          kris={rows}
          year={year}
          onReload={monitoring.load}
        />
      )}
      {workspace === "register" && (
        <>
      <div className="toolbar">
        <label>
          <span>Year</span>
          <select
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
          >
            {sheets.map((sheet) => (
              <option key={sheet.id} value={sheet.year}>
                {sheet.year}
                {sheet.status === "Archived" ? " (archived)" : ""}
                {sheet.status === "Active" ? " (current)" : ""}
              </option>
            ))}
          </select>
        </label>
        <input
          placeholder="Search risk name, code, or indicator…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <label>
          <input
            type="checkbox"
            checked={archived}
            onChange={(event) => setArchived(event.target.checked)}
          />{" "}
          Archived KRIs
        </label>
        <div className="filter-controls">
          <button
            type="button"
            disabled={!selected.length}
            onClick={() =>
              setExpanded((current) => [...new Set([...current, ...selected])])
            }
          >
            Expand selected
          </button>
          <button
            type="button"
            disabled={!selected.length}
            onClick={() =>
              setExpanded((current) => current.filter((id) => !selected.includes(id)))
            }
          >
            Collapse selected
          </button>
          <details className="column-picker">
            <summary>Columns</summary>
            <div>
              {tableFields.map((field) => (
                <label key={field[0]}>
                  <input
                    type="checkbox"
                    checked={visible.includes(field[0])}
                    onChange={() => setColumns(field[0])}
                  />{" "}
                  {field[1]}
                </label>
              ))}
            </div>
          </details>
        </div>
      </div>
      {currentSheet?.status === "Archived" && (
        <p className="kri-archive-note">
          This is the saved {currentSheet.year} sheet. Switch to{" "}
          {activeSheet?.year || "the current year"} to fill in the new year.
        </p>
      )}
      {currentSheet?.status === "Active" && (
        <p className="kri-archive-note">
          These KRIs are from the previous framework and are not mapped to
          Assessment 2026. Use Mapping when the new KRIs launch.
        </p>
      )}
      <div className="tablewrap register-expandable">
        <table>
          <thead>
            <tr>
              <th className="select-col">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() =>
                    setSelected(
                      allSelected ? [] : rows.map((row) => row.id),
                    )
                  }
                  aria-label="Select all KRIs"
                />
              </th>
              <th className="importance-col" aria-label="Importance" />
              {shown.map((field) => (
                <th key={field[0]}>{field[1]}</th>
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={expanded.includes(row.id) ? "row-expanded" : ""}
              >
                <td className="select-col">
                  <input
                    type="checkbox"
                    checked={selected.includes(row.id)}
                    onChange={() => toggleSelected(row.id)}
                    aria-label={`Select ${row.kriNumber}`}
                  />
                </td>
                <td className="importance-col">
                  <ImportanceToggle entityType="kri-records" entityId={row.id} />
                </td>
                {shown.map((field) => (
                  <td key={field[0]}>{renderCell(row, field)}</td>
                ))}
                <td className="actions-col">
                  <button type="button" onClick={() => toggleExpanded(row.id)}>
                    {expanded.includes(row.id) ? "Collapse" : "Expand"}
                  </button>{" "}
                  <button
                    type="button"
                    onClick={() => setMapping({ side: "kri", kriId: row.id })}
                  >
                    Mapping
                  </button>{" "}
                  <button onClick={() => setEdit(row)}>Edit</button>{" "}
                  <button onClick={() => archiveRow(row)}>
                    {archived ? "Restore" : "Archive"}
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={shown.length + 3} className="empty-state">
                  No KRIs in this sheet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {edit && (
        <div className="modal">
          <form onSubmit={save}>
            <div className="modalhead">
              <h2>{edit.id ? "Edit" : "Add"} KRI</h2>
              <button type="button" onClick={() => setEdit(null)}>
                ×
              </button>
            </div>
            <div className="formgrid">
              {FIELDS.map(([name, label, kind, opts]: any) => (
                <label className={kind === "textarea" ? "wide" : ""} key={name}>
                  {label}
                  {kind === "select" ? (
                    <select
                      name={name}
                      defaultValue={edit[name] || opts[0]}
                      required={opts[0] !== ""}
                    >
                      {opts.map((option: string) => (
                        <option key={option || "__blank"} value={option}>
                          {option || "—"}
                        </option>
                      ))}
                    </select>
                  ) : kind === "textarea" ? (
                    <textarea name={name} defaultValue={edit[name] || ""} />
                  ) : (
                    <input
                      name={name}
                      type={kind}
                      step={kind === "number" ? "0.01" : undefined}
                      min={kind === "number" ? 0 : undefined}
                      max={kind === "number" ? 1 : undefined}
                      defaultValue={edit[name] ?? ""}
                    />
                  )}
                </label>
              ))}
            </div>
            {formError && (
              <div className="form-error" role="alert">
                {formError}
              </div>
            )}
            <div className="actions">
              <button type="button" onClick={() => setEdit(null)}>
                Cancel
              </button>
              <button className="primary" type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
        </>
      )}
      {mapping && (
        <OrcaKriMappingModal
          side={mapping.side}
          initialKriId={mapping.kriId}
          onClose={() => setMapping(null)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
