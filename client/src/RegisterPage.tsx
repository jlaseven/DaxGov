import { useEffect, useState, type ReactNode } from "react";
import { api, csv } from "./api";
import { ImportanceToggle, isWatchableType } from "./notifications";
import { badgeClass } from "./theme";

function formatDate(value: string | null | undefined, empty = "—") {
  if (!value) return empty;
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function Badge({ text }: { text: string }) {
  return <span className={badgeClass(text)}>{text}</span>;
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

function FieldInputs({ fields, record }: { fields: any[]; record: any }) {
  return (
    <div className="formgrid">
      {fields.map(([name, label, kind, opts]: any) => (
        <label className={kind === "textarea" ? "wide" : ""} key={name}>
          {label}
          {kind === "select" ? (
            <select
              name={name}
              defaultValue={record[name] || opts[0]}
              required={opts[0] !== ""}
            >
              {opts.map((option: string) => (
                <option key={option || "__blank"} value={option}>
                  {option || "—"}
                </option>
              ))}
            </select>
          ) : kind === "textarea" ? (
            <textarea name={name} defaultValue={record[name] || ""} />
          ) : (
            <input
              name={name}
              type={kind}
              defaultValue={
                kind === "date" && record[name]
                  ? String(record[name]).slice(0, 10)
                  : (record[name] ?? "")
              }
            />
          )}
        </label>
      ))}
    </div>
  );
}

function ChildrenEditor({
  parent,
  config,
  archived,
  onClose,
  onChanged,
}: any) {
  const [edit, setEdit] = useState<any>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const items = (parent[config.listKey] || []).filter((item: any) =>
    archived ? item.archivedAt : !item.archivedAt,
  );
  const save = async (event: any) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const data: any = { [config.parentKey]: parent.id };
    for (const [name, , kind] of config.fields) {
      let value: any = form.get(name);
      if (kind === "number") value = value === "" ? null : Number(value);
      if (kind === "date") value = value || null;
      data[name] = value || null;
    }
    try {
      await api(`/${config.route}${edit?.id ? "/" + edit.id : ""}`, {
        method: edit?.id ? "PUT" : "POST",
        body: JSON.stringify(data),
      });
      setEdit(null);
      await onChanged();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to save the item",
      );
    } finally {
      setSaving(false);
    }
  };
  const archive = async (item: any) => {
    if (!confirm(`${archived ? "Restore" : "Archive"} this ${config.singular}?`))
      return;
    await api(
      `/${config.route}/${item.id}/${archived ? "restore" : "archive"}`,
      { method: "POST" },
    );
    await onChanged();
  };
  return (
    <div className="modal">
      <div className="children-drawer">
        <div className="modalhead">
          <div>
            <h2>
              {config.singular}s ·{" "}
              {parent.objectiveName || parent.initiativeName}
            </h2>
            <p>Progress and parent status update from these records.</p>
          </div>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="actions">
          <button
            className="primary"
            type="button"
            onClick={() => {
              setError("");
              setEdit({});
            }}
          >
            Add {config.singular}
          </button>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Owner</th>
                <th>End date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => (
                <tr key={item.id}>
                  <td>{item[config.nameField]}</td>
                  <td>
                    <Badge text={item[config.statusField]} />
                  </td>
                  <td>{item.assignees || item.owner || "—"}</td>
                  <td>{formatDate(item.endDate)}</td>
                  <td>
                    <button onClick={() => setEdit(item)}>Edit</button>{" "}
                    <button onClick={() => archive(item)}>
                      {archived ? "Restore" : "Archive"}
                    </button>
                  </td>
                </tr>
              ))}
              {!items.length && (
                <tr>
                  <td colSpan={5} className="empty-state">
                    No {config.singular.toLowerCase()}s yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {edit && (
          <form className="inline-form" onSubmit={save}>
            <h3>
              {edit.id ? "Edit" : "Add"} {config.singular}
            </h3>
            <FieldInputs fields={config.fields} record={edit} />
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <div className="actions">
              <button type="button" onClick={() => setEdit(null)}>
                Cancel
              </button>
              <button className="primary" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function RegisterPage({
  type,
  config: c,
  extraActions,
  onMapRow,
}: {
  type: string;
  config: any;
  extraActions?: ReactNode;
  onMapRow?: (row: any) => void;
}) {
  const tableColumns = [
    ...(c.extraColumns || []),
    ...c.fields.map((field: any[]) => [field[0], field[1], field[2]]),
  ].filter(
    (column: any[], index: number, list: any[]) =>
      list.findIndex((item) => item[0] === column[0]) === index,
  );
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [archived, setArchived] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [childrenFor, setChildrenFor] = useState<any>(null);
  const [toast, setToast] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<any>({ total: 0, totalPages: 1 });
  const [selected, setSelected] = useState<number[]>([]);
  const [expanded, setExpanded] = useState<number[]>([]);
  const expandable = Boolean(c.expandableRows);
  const [visible, setVisible] = useState<string[]>(() => {
    try {
      return (
        JSON.parse(localStorage.getItem(`columns-${type}`) || "null") ||
        c.defaultVisible ||
        c.fields.slice(0, 6).map((field: any[]) => field[0])
      );
    } catch {
      return c.defaultVisible || c.fields.slice(0, 6).map((field: any[]) => field[0]);
    }
  });
  const derivedFilterKeys = new Set([
    "tcdStatus",
    "overdueStatus",
    "progress.status",
    "calculatedStatus",
  ]);
  const buildParams = (targetPage: number, pageSize: number) => {
    const params = new URLSearchParams({
      search,
      archived: String(archived),
      page: String(targetPage),
      pageSize: String(pageSize),
    });
    for (const [key, value] of Object.entries(filters)) {
      if (!value) continue;
      if (key === "progress.status") params.set("progressStatus", value);
      else if (derivedFilterKeys.has(key)) params.set(key, value);
      else params.set("filter." + key, value);
    }
    return params;
  };
  const pageSize = c.pageSize || 15;
  const load = () =>
    api(`/${type}?${buildParams(page, pageSize)}`).then((x) => {
      setRows(x.data);
      setMeta(x.meta || { total: x.data.length, totalPages: 1 });
    });
  useEffect(() => {
    void load();
  }, [search, archived, type, page, filters]);
  useEffect(() => {
    setFilters({});
    setPage(1);
    setSelected([]);
    setExpanded([]);
    try {
      setVisible(
        JSON.parse(localStorage.getItem(`columns-${type}`) || "null") ||
          c.defaultVisible ||
          c.fields.slice(0, 6).map((field: any[]) => field[0]),
      );
    } catch {
      setVisible(
        c.defaultVisible || c.fields.slice(0, 6).map((field: any[]) => field[0]),
      );
    }
  }, [type]);
  useEffect(() => {
    setPage(1);
    setSelected([]);
  }, [search, archived, filters]);
  useEffect(() => {
    if (!childrenFor) return;
    const next = rows.find((row) => row.id === childrenFor.id);
    if (next) setChildrenFor(next);
  }, [rows]);
  const filterOptions = (key: string, configured?: string[]) => {
    if (configured) return configured;
    const fieldOptions = c.fields.find((field: any[]) => field[0] === key)?.[3];
    if (fieldOptions) return fieldOptions;
    return [
      ...new Set(
        rows
          .map((row) =>
            key.split(".").reduce((value: any, part) => value?.[part], row),
          )
          .filter(Boolean)
          .map(String),
      ),
    ].sort();
  };
  const exportCell = (row: any, column: any[]) => {
    const [key, , kind] = column;
    if (kind === "due" || key === "effectiveTargetDate")
      return formatDate(row.effectiveTargetDate, "");
    if (kind === "progress" || key === "progress") {
      const percent = Math.round(row.progress?.donePercentage || 0);
      const status = row.progress?.status || "";
      return status ? `${percent}% · ${status}` : `${percent}%`;
    }
    if (kind === "date") return formatDate(row[key], "");
    const value = row[key];
    if (value == null || value === "") return "";
    if (typeof value === "object") return "";
    return value;
  };
  const exportRows = (source: any[]) =>
    source.map((row) => {
      const out: Record<string, any> = {};
      for (const column of tableColumns) out[column[1]] = exportCell(row, column);
      return out;
    });
  const showToast = (message: string, ms = 2500) => {
    setToast(message);
    setTimeout(() => setToast(""), ms);
  };
  const closeExportMenu = (event: { currentTarget: HTMLElement }) => {
    event.currentTarget.closest("details")?.removeAttribute("open");
  };
  const downloadCsv = (source: any[], name: string) => {
    const mapped = exportRows(source);
    if (!mapped.length) return false;
    csv(mapped, name);
    return true;
  };
  const exportPage = (event: { currentTarget: HTMLElement }) => {
    closeExportMenu(event);
    if (!downloadCsv(rows, `${c.title} page ${page}`))
      showToast("No records to export");
  };
  const exportAll = async (event: { currentTarget: HTMLElement }) => {
    closeExportMenu(event);
    setExporting(true);
    try {
      const params = buildParams(1, pageSize);
      params.set("all", "true");
      const response = await api(`/${type}?${params}`);
      const count = response.data?.length || 0;
      if (!downloadCsv(response.data, c.title)) {
        showToast("No records to export");
        return;
      }
      showToast(`Exported all ${count} records`);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Unable to export records",
        3500,
      );
    } finally {
      setExporting(false);
    }
  };
  const save = async (event: any) => {
    event.preventDefault();
    if (submitting) return;
    setFormError("");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const data: any = {};
    for (const [name, , kind] of c.fields) {
      let value: any = form.get(name);
      if (kind === "number") value = value === "" ? null : Number(value);
      if (kind === "date") value = value || null;
      data[name] = value || null;
    }
    try {
      await api(`/${type}${edit?.id ? "/" + edit.id : ""}`, {
        method: edit?.id ? "PUT" : "POST",
        body: JSON.stringify(data),
      });
      setEdit(null);
      setToast("Saved successfully");
      await load();
      setTimeout(() => setToast(""), 2500);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Unable to save the record",
      );
    } finally {
      setSubmitting(false);
    }
  };
  const archive = async (row: any) => {
    if (!confirm(`${archived ? "Restore" : "Archive"} this record?`)) return;
    await api(`/${type}/${row.id}/${archived ? "restore" : "archive"}`, {
      method: "POST",
    });
    load();
  };
  const setColumns = (key: string) =>
    setVisible((current) => {
      const next = current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key];
      localStorage.setItem(`columns-${type}`, JSON.stringify(next));
      return next;
    });
  const toggleSelected = (id: number) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  const toggleExpanded = (id: number) =>
    setExpanded((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  const allSelected =
    rows.length > 0 && rows.every((row) => selected.includes(row.id));
  const toggleSelectAll = () =>
    setSelected((current) =>
      allSelected
        ? current.filter((id) => !rows.some((row) => row.id === id))
        : [...new Set([...current, ...rows.map((row) => row.id)])],
    );
  const expandSelected = () => {
    if (!selected.length) return;
    setExpanded((current) => [...new Set([...current, ...selected])]);
  };
  const collapseSelected = () => {
    if (!selected.length) return;
    setExpanded((current) => current.filter((id) => !selected.includes(id)));
  };
  const shown = tableColumns.filter((column: any[]) =>
    visible.includes(column[0]),
  );
  const emptyColSpan =
    shown.length +
    (c.children ? 2 : 1) +
    (isWatchableType(type) ? 1 : 0) +
    (expandable ? 1 : 0);
  const renderCell = (row: any, column: any[]) => {
    const [key, , kind] = column;
    if (kind === "due" || key === "effectiveTargetDate")
      return (
        <span
          className={row.effectiveTargetDate ? "due-date" : "due-date missing"}
        >
          {formatDate(row.effectiveTargetDate, "No target date")}
          {row.effectiveTargetDate && (
            <small>
              {row.updatedTargetDate ? "Updated target" : "Original target"}
            </small>
          )}
        </span>
      );
    if (kind === "badge" || key === "tcdStatus" || key === "overdueStatus")
      return <Badge text={row[key]} />;
    if (kind === "progress" || key === "progress")
      return (
        <>
          {Math.round(row.progress?.donePercentage || 0)}% ·{" "}
          {row.progress?.status}
        </>
      );
    if (kind === "date") return formatDate(row[key]);
    if (kind === "url" && row[key])
      return (
        <a href={row[key]} target="_blank" rel="noreferrer">
          Open
        </a>
      );
    const value = row[key];
    if (value == null || value === "") return "—";
    return String(value);
  };
  const childItems = (row: any) =>
    (row[c.children?.listKey] || []).filter((item: any) =>
      archived ? item.archivedAt : !item.archivedAt,
    );
  return (
    <Page
      title={c.title}
      subtitle={`${rows.length} of ${meta.total || rows.length} records shown`}
      actions={
        <div className="actions">
          {extraActions}
          <details className="export-menu">
            <summary>Export CSV</summary>
            <div>
              <button
                type="button"
                disabled={!rows.length || exporting}
                onClick={exportPage}
              >
                This page · {rows.length} row{rows.length === 1 ? "" : "s"}
              </button>
              <button
                type="button"
                disabled={!(meta.total || rows.length) || exporting}
                onClick={(event) => void exportAll(event)}
              >
                {exporting
                  ? "Exporting all…"
                  : `All records · ${meta.total || rows.length} row${
                      (meta.total || rows.length) === 1 ? "" : "s"
                    }`}
              </button>
            </div>
          </details>
          <button onClick={() => print()}>Print</button>
          <button
            className="primary"
            onClick={() => {
              setFormError("");
              setEdit({});
            }}
          >
            Add {c.singular}
          </button>
        </div>
      }
    >
      <div className="toolbar">
        <input
          placeholder="Search records…"
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
          {c.filters.map(([key, label, configured]: any[]) => (
            <label key={key}>
              <span>{label}</span>
              <select
                value={filters[key] || ""}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
              >
                <option value="">All</option>
                {filterOptions(key, configured).map((option: string) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setFilters({});
            }}
          >
            Clear filters
          </button>
          <details className="column-picker">
            <summary>Columns</summary>
            <div>
              {tableColumns.map((column: any[]) => (
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
          {expandable && (
            <>
              <button
                type="button"
                disabled={!selected.length}
                onClick={expandSelected}
              >
                Expand selected
              </button>
              <button
                type="button"
                disabled={!selected.length}
                onClick={collapseSelected}
              >
                Collapse selected
              </button>
            </>
          )}
        </div>
      </div>
      <div className={expandable ? "tablewrap register-expandable" : "tablewrap"}>
        <table>
          <thead>
            <tr>
              {expandable && (
                <th className="select-col">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all rows on this page"
                  />
                </th>
              )}
              {isWatchableType(type) && (
                <th className="importance-col" aria-label="Importance" />
              )}
              {shown.map((column: any[]) => (
                <th key={column[0]}>{column[1]}</th>
              ))}
              {c.children && <th>{c.children.singular}s</th>}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={expanded.includes(row.id) ? "row-expanded" : ""}
              >
                {expandable && (
                  <td className="select-col">
                    <input
                      type="checkbox"
                      checked={selected.includes(row.id)}
                      onChange={() => toggleSelected(row.id)}
                      aria-label={`Select ${row.riskNo || row.id}`}
                    />
                  </td>
                )}
                {isWatchableType(type) && (
                  <td className="importance-col">
                    <ImportanceToggle entityType={type} entityId={row.id} />
                  </td>
                )}
                {shown.map((column: any[]) => (
                  <td key={column[0]}>{renderCell(row, column)}</td>
                ))}
                {c.children && (
                  <td>
                    <button onClick={() => setChildrenFor(row)}>
                      {childItems(row).length} {c.children.singular}
                      {childItems(row).length === 1 ? "" : "s"}
                    </button>
                  </td>
                )}
                <td className="actions-col">
                  {expandable && (
                    <>
                      <button
                        type="button"
                        onClick={() => toggleExpanded(row.id)}
                      >
                        {expanded.includes(row.id) ? "Collapse" : "Expand"}
                      </button>{" "}
                    </>
                  )}
                  {onMapRow && (
                    <>
                      <button type="button" onClick={() => onMapRow(row)}>
                        Mapping
                      </button>{" "}
                    </>
                  )}
                  <button onClick={() => setEdit(row)}>Edit</button>{" "}
                  <button onClick={() => archive(row)}>
                    {archived ? "Restore" : "Archive"}
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={emptyColSpan} className="empty-state">
                  No records match the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <span>
          {meta.total || 0} records · Page {page} of {meta.totalPages || 1}
        </span>
        <button disabled={page === 1} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <button
          disabled={page >= (meta.totalPages || 1)}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
      {edit && (
        <div className="modal">
          <form onSubmit={save}>
            <div className="modalhead">
              <h2>
                {edit.id ? "Edit" : "Add"} {c.singular}
              </h2>
              <button type="button" onClick={() => setEdit(null)}>
                ×
              </button>
            </div>
            <FieldInputs fields={c.fields} record={edit} />
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
      {childrenFor && c.children && (
        <ChildrenEditor
          parent={childrenFor}
          config={c.children}
          archived={archived}
          onClose={() => setChildrenFor(null)}
          onChanged={load}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </Page>
  );
}
