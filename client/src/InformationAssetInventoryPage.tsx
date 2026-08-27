import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./api";
import { ImportanceToggle } from "./notifications";
import { DepartmentsManager } from "./DepartmentsManager";

const editableFields = [
  "assetName",
  "assetType",
  "businessImpact",
  "threat",
  "vulnerability",
  "likelihood",
  "impact",
  "riskLevel",
  "existingControls",
] as const;

function updatePayload(asset: any) {
  return Object.fromEntries(
    editableFields.map((field) => [
      field,
      field === "assetName"
        ? String(asset[field] || "").trim()
        : String(asset[field] || "").trim() || null,
    ]),
  );
}

const researchModelOptions = [
  ["both", "Kimi K2 + GLM"],
  ["kimi", "Kimi K2"],
  ["glm", "GLM"],
] as const;

function researchModelLabel(models: string) {
  return (
    researchModelOptions.find(([value]) => value === models)?.[1] ||
    "Kimi K2 + GLM"
  );
}

function formatResearchDate(value: string | null) {
  if (!value) return "Not researched yet";
  return `Model Garden research updated ${new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))}`;
}

function isIncompleteFinding(text: string) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return true;
  if (/…/.test(value) || /\.{3}$/.test(value)) return true;
  return /\b(?:and|or|the|of|to|for|with|a|an|by|in|on|at|from|into|including|could|would|may|might|that|which|who|its|their)$/i.test(
    value.replace(/["')\]]+$/, ""),
  );
}

function isInstructionalFinding(text: string) {
  return /^(?:bullet|finding|item|point)\s*\d+\s*[:.)-]?\s*$/i.test(
    String(text || "").trim(),
  );
}

function InventoryValue({
  value,
  expanded = false,
}: {
  value?: string | null;
  expanded?: boolean;
}) {
  const text = String(value || "").trim();
  if (!text) return <span className="asset-readout">—</span>;
  const lines = text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?:^|\s)•\s+/))
    .map((line) =>
      line
        .replace(/^\s*•\s*/, "")
        .replace(/^(?:bullet|finding|item|point)\s*\d+\s*[:.)-]?\s*/i, "")
        .trim(),
    )
    .filter(
      (line) =>
        line && !isIncompleteFinding(line) && !isInstructionalFinding(line),
    );
  if (!lines.length)
    return (
      <span className="asset-readout">
        Incomplete findings were removed. Run research again for a complete
        analysis.
      </span>
    );
  if (lines.length <= 1) {
    return (
      <span
        className={`asset-readout asset-readout-justified${
          expanded ? " is-expanded" : ""
        }`}
      >
        {lines[0] || text}
      </span>
    );
  }
  return (
    <ul
      className={`asset-readout-list${expanded ? " is-expanded" : ""}`}
    >
      {lines.map((line, index) => (
        <li key={`${index}-${line.slice(0, 24)}`}>{line}</li>
      ))}
    </ul>
  );
}

export default function InformationAssetInventoryPage() {
  const [scope, setScope] = useState(
    () => new URLSearchParams(window.location.search).get("department") || "",
  );
  const [data, setData] = useState<any>({ departments: [], assets: [] });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [researching, setResearching] = useState<number[]>([]);
  const [researchProgress, setResearchProgress] = useState("");
  const [researchDone, setResearchDone] = useState(0);
  const [researchTotal, setResearchTotal] = useState(0);
  const [researchModels, setResearchModels] = useState("both");
  const [researchEnabled, setResearchEnabled] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<any>(null);
  const [manageDepartments, setManageDepartments] = useState(false);
  const [expandedCols, setExpandedCols] = useState<string[]>([
    "businessImpact",
    "threat",
    "vulnerability",
    "existingControls",
  ]);

  const toggleColumn = (field: string) => {
    setExpandedCols((current) =>
      current.includes(field)
        ? current.filter((item) => item !== field)
        : [...current, field],
    );
  };

  const load = async (department = scope) => {
    setLoading(true);
    try {
      const response = await api(
        `/information-assets${
          department ? `?department=${encodeURIComponent(department)}` : ""
        }`,
      );
      setData(response.data);
      setResearchEnabled(response.meta?.researchEnabled !== false);
    } finally {
      setLoading(false);
    }
  };

  const syncFromDaxon = async (showMessage = true) => {
    setSyncing(true);
    setError("");
    try {
      const response = await api("/information-assets/sync", {
        method: "POST",
      });
      if (showMessage) {
        const { created, updated, removed } = response.data;
        setMessage(
          created || updated || removed
            ? `Aligned with Daxon: ${created} added, ${updated} updated, ${removed} removed.`
            : "Information Asset Inventory is already synchronized with Daxon.",
        );
      }
      await load(scope);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to synchronize Daxon assets.",
      );
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    void syncFromDaxon(false);
  }, []);

  useEffect(() => {
    setEditingId(null);
    setDraft(null);
    if (!syncing) void load(scope);
    const nextUrl = scope
      ? `/information-assets?department=${encodeURIComponent(scope)}`
      : "/information-assets";
    window.history.replaceState(null, "", nextUrl);
  }, [scope]);

  const changeDraft = (field: string, value: string) => {
    setDraft((current: any) =>
      current ? { ...current, [field]: value } : current,
    );
  };

  const startEdit = (asset: any) => {
    setError("");
    setEditingId(asset.id);
    setDraft({ ...asset });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const deleteAsset = async (asset: any) => {
    if (
      !confirm(
        `Delete ${asset.assetName}? If this asset still exists in a Daxon assessment, Sync from Daxon may add it again.`,
      )
    )
      return;
    setError("");
    try {
      await api(`/information-assets/${asset.id}`, { method: "DELETE" });
      if (editingId === asset.id) cancelEdit();
      setMessage(`Deleted ${asset.assetName}.`);
      await load(scope);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to delete the information asset.",
      );
    }
  };

  const saveAsset = async (asset: any, announce = true) => {
    setSavingId(asset.id);
    setError("");
    try {
      const response = await api(`/information-assets/${asset.id}`, {
        method: "PUT",
        body: JSON.stringify(updatePayload(asset)),
      });
      setData((current: any) => ({
        ...current,
        assets: current.assets.map((item: any) =>
          item.id === asset.id ? response.data : item,
        ),
      }));
      if (announce) setMessage(`Saved ${response.data.assetName}.`);
      if (editingId === asset.id) {
        setEditingId(null);
        setDraft(null);
      }
      return response.data;
    } finally {
      setSavingId(null);
    }
  };

  const saveDraft = async () => {
    if (!draft) return;
    try {
      await saveAsset(draft);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to save the asset.",
      );
    }
  };

  const researchAssets = async (assets: any[]) => {
    if (!assets.length) return;
    setError("");
    setMessage("");
    setResearching(assets.map((asset) => asset.id));
    setResearchTotal(assets.length);
    setResearchDone(0);
    let completed = 0;
    const failed: string[] = [];
    for (const [index, draft] of assets.entries()) {
      setResearchProgress(
        `Scraping vulnerabilities, reading Daxon and ORCA, then refining with ${researchModelLabel(researchModels)} ${index + 1} of ${assets.length}: ${draft.assetName}`,
      );
      try {
        const saved = await saveAsset(draft, false);
        const response = await api(`/information-assets/${saved.id}/research`, {
          method: "POST",
          body: JSON.stringify({ models: researchModels }),
        });
        setData((current: any) => ({
          ...current,
          assets: current.assets.map((item: any) =>
            item.id === saved.id ? response.data : item,
          ),
        }));
        completed += 1;
      } catch (reason) {
        failed.push(
          `${draft.assetName}: ${
            reason instanceof Error ? reason.message : "research failed"
          }`,
        );
      }
      setResearchDone(index + 1);
    }
    if (completed)
      setMessage(
        `${researchModelLabel(researchModels)} research completed for ${completed} asset${completed === 1 ? "" : "s"}.`,
      );
    if (failed.length)
      setError(
        failed.length === 1
          ? failed[0]
          : `${failed.length} assets could not be researched. ${failed[0]}`,
      );
    setResearching([]);
    setResearchProgress("");
    setResearchDone(0);
    setResearchTotal(0);
  };

  const researchVisibleAssets = () => {
    researchAssets(data.assets);
  };

  const departmentGroups = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const asset of data.assets) {
      const group = groups.get(asset.department) || [];
      group.push(asset);
      groups.set(asset.department, group);
    }
    return [...groups.entries()].sort(([first], [second]) =>
      first.localeCompare(second),
    );
  }, [data.assets]);

  const scopeName = scope
    ? data.departments.find((item: any) => item.departmentKey === scope)
        ?.department || "Department"
    : "Whole organization";
  const busyResearching = researching.length > 0;
  const currentResearchItem =
    busyResearching && researchTotal
      ? Math.min(researchDone + 1, researchTotal)
      : researchDone;
  const researchPercent = researchTotal
    ? Math.round((researchDone / researchTotal) * 100)
    : 0;
  const researchBarPercent = researchTotal
    ? Math.min(
        100,
        Math.max(
          busyResearching ? 8 : 0,
          Math.round(
            ((researchDone + (researchDone < researchTotal ? 0.4 : 0)) /
              researchTotal) *
              100,
          ),
        ),
      )
    : 0;

  return (
    <div className="page asset-inventory-page">
      <div className="pagehead">
        <div>
          <h1>Information Asset Inventory</h1>
          <p>Department-level OCTAVE asset analysis synchronized from Daxon</p>
        </div>
        <div className="pagehead-actions">
          <Link className="asset-secondary-button" to="/isra/daxon-answers">
            View Daxon answers
          </Link>
          <button
            className="asset-secondary-button"
            type="button"
            onClick={() => setManageDepartments(true)}
          >
            Manage departments
          </button>
          <button
            className="asset-secondary-button"
            type="button"
            disabled={syncing || busyResearching}
            onClick={() => syncFromDaxon()}
          >
            {syncing ? "Syncing…" : "Sync from Daxon"}
          </button>
          <label className="asset-research-model">
            Research models
            <select
              value={researchModels}
              disabled={busyResearching || !researchEnabled}
              onChange={(event) => setResearchModels(event.target.value)}
            >
              {researchModelOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="asset-research-button"
            type="button"
            disabled={
              !researchEnabled ||
              !data.assets.length ||
              syncing ||
              busyResearching
            }
            onClick={researchVisibleAssets}
          >
            {!researchEnabled
              ? "Web research is disabled"
              : busyResearching
                ? "Researching…"
                : `Start ${researchModelLabel(researchModels)} research`}
          </button>
        </div>
      </div>

      <section className="asset-inventory-hero">
        <div>
          <span>MODEL GARDEN ASSET ANALYSIS</span>
          <h2>
            Build the inventory from knowledge your departments already shared.
          </h2>
          <p>
            Asset names and existing controls come from the current Daxon named
            lists — one row per asset or control. When Daxon answers are
            revised, this inventory is rebuilt to match. Research scrapes
            public vulnerability sources first, reads matching Daxon answers
            and ORCA risks, then Kimi K2 and GLM refine those findings for
            PDAX. Placeholder schema text is rejected and retried. If web
            scraping is unavailable, one model drafts from internal records
            and the other checks it. If GLM does not return usable JSON, it
            retries twice more before the other model’s result is used. If both
            models fail to return JSON, research still finishes from Daxon,
            ORCA, and any public CVEs. The bulk button continues to the next
            asset if one item fails. It produces two to
            three short bullets for business impact, threats, and
            vulnerabilities. Vulnerabilities are mapped to OWASP Top 10:2025
            and include a CVE/CVSS rating when public research cites one.
          </p>
        </div>
        <div className="asset-inventory-stats">
          <div>
            <strong>{data.assets.length}</strong>
            <span>Visible assets</span>
          </div>
          <div>
            <strong>{departmentGroups.length}</strong>
            <span>Departments</span>
          </div>
          <div>
            <strong>
              {
                data.assets.filter((asset: any) => asset.researchUpdatedAt)
                  .length
              }
            </strong>
            <span>Researched</span>
          </div>
        </div>
      </section>

      <section className="asset-scope-bar">
        <div>
          <span>Inventory scope</span>
          <strong>{scopeName}</strong>
        </div>
        <label>
          View department
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value)}
          >
            <option value="">All departments</option>
            {data.departments.map((department: any) => (
              <option
                key={department.departmentKey}
                value={department.departmentKey}
              >
                {department.department}
              </option>
            ))}
          </select>
        </label>
      </section>

      {error && <div className="asset-message error">{error}</div>}
      {message && <div className="asset-message success">{message}</div>}

      {loading ? (
        <div className="asset-empty">Loading information assets…</div>
      ) : !departmentGroups.length ? (
        <div className="asset-empty">
          No assets were found. Complete a Daxon assessment, then select “Sync
          from Daxon.”
        </div>
      ) : (
        departmentGroups.map(([department, assets], groupIndex) => (
          <section className="asset-department" key={department}>
            {busyResearching && groupIndex === 0 ? (
              <div
                className="asset-research-progress"
                role="status"
                aria-live="polite"
                aria-label={`Research ${researchPercent}% complete`}
              >
                <div className="asset-research-progress-copy">
                  <strong>Research in progress</strong>
                  <span>
                    Asset {currentResearchItem} of {researchTotal} ·{" "}
                    {researchPercent}%
                  </span>
                </div>
                <div className="asset-research-progress-track">
                  <i
                    className="is-busy"
                    style={{ width: `${researchBarPercent}%` }}
                  />
                </div>
                {researchProgress ? <small>{researchProgress}</small> : null}
              </div>
            ) : null}
            <div className="asset-department-heading">
              <div>
                <span>DEPARTMENT ASSET INVENTORY</span>
                <h2>{department}</h2>
              </div>
              <strong>{assets.length} asset(s)</strong>
            </div>
            <div className="asset-table-shell">
              <table>
                <thead>
                  <tr>
                    <th className="importance-col" aria-label="Importance" />
                    <th className="asset-name-col">Asset Name</th>
                    <th>Asset Type</th>
                    {(
                      [
                        ["businessImpact", "Business Impact"],
                        ["threat", "Threat"],
                        ["vulnerability", "Vulnerability"],
                      ] as const
                    ).map(([field, label]) => (
                      <th
                        key={field}
                        className={`asset-wide-col${
                          expandedCols.includes(field) ? " is-expanded" : ""
                        }`}
                        title="Click to widen or compact this column"
                        onClick={() => toggleColumn(field)}
                      >
                        {label}
                        <span className="asset-col-expand" aria-hidden="true">
                          {expandedCols.includes(field) ? "Wide" : "Compact"}
                        </span>
                      </th>
                    ))}
                    <th>Likelihood</th>
                    <th>Impact</th>
                    <th>Risk Level</th>
                    <th
                      className={`asset-wide-col${
                        expandedCols.includes("existingControls")
                          ? " is-expanded"
                          : ""
                      }`}
                      title="Click to widen or compact this column"
                      onClick={() => toggleColumn("existingControls")}
                    >
                      Existing Controls
                      <span className="asset-col-expand" aria-hidden="true">
                        {expandedCols.includes("existingControls")
                          ? "Wide"
                          : "Compact"}
                      </span>
                    </th>
                    <th className="asset-actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((asset: any) => {
                    const editing = editingId === asset.id && draft;
                    const row = editing ? draft : asset;
                    return (
                      <tr
                        key={asset.id}
                        className={editing ? "asset-row-editing" : ""}
                      >
                        <td className="importance-col">
                          <ImportanceToggle
                            entityType="information-assets"
                            entityId={asset.id}
                          />
                        </td>
                        <td className="asset-name-cell">
                          {editing ? (
                            <textarea
                              value={row.assetName || ""}
                              onChange={(event) =>
                                changeDraft("assetName", event.target.value)
                              }
                            />
                          ) : (
                            <strong>{row.assetName || "—"}</strong>
                          )}
                          <small>
                            {formatResearchDate(row.researchUpdatedAt)}
                          </small>
                        </td>
                        <td>
                          {editing ? (
                            <input
                              value={row.assetType || ""}
                              placeholder="Asset type"
                              onChange={(event) =>
                                changeDraft("assetType", event.target.value)
                              }
                            />
                          ) : (
                            <InventoryValue value={row.assetType} />
                          )}
                        </td>
                        {["businessImpact", "threat", "vulnerability"].map(
                          (field) => (
                            <td
                              key={field}
                              className={`asset-wide-cell${
                                expandedCols.includes(field) ? " is-expanded" : ""
                              }`}
                            >
                              {editing ? (
                                <textarea
                                  className="asset-bullet-field"
                                  value={row[field] || ""}
                                  placeholder="Use Model Garden research or enter details"
                                  onChange={(event) =>
                                    changeDraft(field, event.target.value)
                                  }
                                />
                              ) : (
                                <InventoryValue
                                  value={row[field]}
                                  expanded={expandedCols.includes(field)}
                                />
                              )}
                            </td>
                          ),
                        )}
                        {["likelihood", "impact", "riskLevel"].map((field) => (
                          <td key={field}>
                            {editing ? (
                              <input
                                value={row[field] || ""}
                                onChange={(event) =>
                                  changeDraft(field, event.target.value)
                                }
                              />
                            ) : (
                              <InventoryValue value={row[field]} />
                            )}
                          </td>
                        ))}
                        <td
                          className={`asset-wide-cell${
                            expandedCols.includes("existingControls")
                              ? " is-expanded"
                              : ""
                          }`}
                        >
                          {editing ? (
                            <textarea
                              className="asset-controls-field"
                              value={row.existingControls || ""}
                              onChange={(event) =>
                                changeDraft(
                                  "existingControls",
                                  event.target.value,
                                )
                              }
                            />
                          ) : (
                            <InventoryValue
                              value={row.existingControls}
                              expanded={expandedCols.includes("existingControls")}
                            />
                          )}
                        </td>
                        <td className="asset-actions-col">
                          <div className="row-actions">
                            {editing ? (
                              <>
                                <button
                                  type="button"
                                  disabled={
                                    savingId === asset.id || busyResearching
                                  }
                                  onClick={() => void saveDraft()}
                                >
                                  {savingId === asset.id ? "Saving…" : "Save"}
                                </button>
                                <button
                                  type="button"
                                  disabled={savingId === asset.id}
                                  onClick={cancelEdit}
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                disabled={busyResearching || savingId === asset.id}
                                onClick={() => startEdit(asset)}
                              >
                                Edit
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={
                                !researchEnabled ||
                                busyResearching ||
                                savingId === asset.id
                              }
                              onClick={() =>
                                researchAssets([editing ? row : asset])
                              }
                            >
                              {researchEnabled
                                ? "Research this asset"
                                : "Research disabled"}
                            </button>
                            <button
                              type="button"
                              disabled={
                                busyResearching || savingId === asset.id
                              }
                              onClick={() => void deleteAsset(asset)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
      <DepartmentsManager
        open={manageDepartments}
        onClose={() => setManageDepartments(false)}
        onChanged={() => void load(scope)}
      />
    </div>
  );
}
