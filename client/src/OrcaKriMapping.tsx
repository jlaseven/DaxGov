import { useEffect, useId, useMemo, useState } from "react";
import { api } from "./api";

type OrcaRisk = {
  id: number;
  riskNo: string;
  processNo: string;
  process: string;
  riskThreat: string;
};

type KriRow = {
  id: number;
  year: number;
  sheetStatus: string;
  riskCode?: string | null;
  riskName: string;
  kriNumber: string;
  keyRiskIndicator: string;
  orcaRiskIds: number[];
};

type MappingData = {
  sheets: { id: number; year: number; status: string }[];
  kris: KriRow[];
  orcaRisks: OrcaRisk[];
};

function kriTitle(item: KriRow) {
  return `${item.riskCode || item.riskName} · ${item.kriNumber}`;
}

function ForkArrow({
  count,
  dashed = false,
}: {
  count: number;
  dashed?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const n = Math.max(count, 1);
  const row = 88;
  const height = n * row;
  const leftY = height / 2;
  const xs = 6;
  const xm = 36;
  const xe = 70;
  const ys = Array.from({ length: n }, (_, i) => i * row + row / 2);
  const markerId = `mapping-head-${uid}`;
  return (
    <svg
      className={`mapping-fork${dashed ? " is-dashed" : ""}`}
      viewBox={`0 0 80 ${height}`}
      width="80"
      height={height}
      aria-hidden="true"
    >
      <defs>
        <marker
          id={markerId}
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="4"
          orient="auto"
        >
          <path d="M0 0 L8 4 L0 8 Z" fill="currentColor" />
        </marker>
      </defs>
      {n === 1 ? (
        <line
          x1={xs}
          y1={leftY}
          x2={xe}
          y2={ys[0]}
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray={dashed ? "6 4" : undefined}
          markerEnd={`url(#${markerId})`}
        />
      ) : (
        <>
          <line
            x1={xs}
            y1={leftY}
            x2={xm}
            y2={leftY}
            stroke="currentColor"
            strokeWidth="2"
          />
          <line
            x1={xm}
            y1={ys[0]}
            x2={xm}
            y2={ys[n - 1]}
            stroke="currentColor"
            strokeWidth="2"
          />
          {ys.map((y, index) => (
            <line
              key={index}
              x1={xm}
              y1={y}
              x2={xe}
              y2={y}
              stroke="currentColor"
              strokeWidth="2"
              markerEnd={`url(#${markerId})`}
            />
          ))}
        </>
      )}
    </svg>
  );
}

function MappingFlow({
  fromTitle,
  fromDetail,
  fromActive,
  onSelectFrom,
  arrowLabel,
  targets,
  emptyLabel,
  onRemoveTarget,
}: {
  fromTitle: string;
  fromDetail: string;
  fromActive?: boolean;
  onSelectFrom?: () => void;
  arrowLabel: string;
  targets: { id: number; title: string; detail: string }[];
  emptyLabel: string;
  onRemoveTarget?: (id: number) => void;
}) {
  return (
    <div className={`mapping-flow${fromActive ? " is-active" : ""}`}>
      <button
        type="button"
        className="mapping-node mapping-node-from"
        onClick={onSelectFrom}
      >
        <strong>{fromTitle}</strong>
        <small>{fromDetail}</small>
      </button>
      <div className="mapping-connector">
        <span className="mapping-arrow-label">{arrowLabel}</span>
        <ForkArrow count={targets.length || 1} dashed={!targets.length} />
      </div>
      <div className="mapping-targets">
        {targets.length ? (
          targets.map((item) => (
            <div key={item.id} className="mapping-node mapping-node-to">
              <div>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </div>
              {onRemoveTarget && (
                <button
                  type="button"
                  className="mapping-unlink"
                  onClick={() => onRemoveTarget(item.id)}
                  aria-label={`Remove ${item.title}`}
                >
                  ×
                </button>
              )}
            </div>
          ))
        ) : (
          <div className="mapping-node mapping-node-empty">{emptyLabel}</div>
        )}
      </div>
    </div>
  );
}

export function OrcaKriMappingModal({
  side,
  initialKriId,
  initialOrcaId,
  onClose,
}: {
  side: "kri" | "orca";
  initialKriId?: number;
  initialOrcaId?: number;
  onClose: () => void;
}) {
  const [data, setData] = useState<MappingData | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [year, setYear] = useState<number | "">("");
  const [kriId, setKriId] = useState<number | "">(initialKriId || "");
  const [orcaId, setOrcaId] = useState<number | "">(initialOrcaId || "");
  const [selectedOrca, setSelectedOrca] = useState<number[]>([]);
  const [selectedKri, setSelectedKri] = useState<number[]>([]);
  const [saved, setSaved] = useState("");
  const [query, setQuery] = useState("");

  const load = async () => {
    const response = await api("/kri-mappings");
    const payload = response.data as MappingData;
    setData(payload);
    const active = payload.sheets.find((sheet) => sheet.status === "Active");
    setYear((current) => current || active?.year || payload.sheets[0]?.year || "");
  };

  useEffect(() => {
    void load().catch((reason) =>
      setError(reason instanceof Error ? reason.message : "Unable to load mapping"),
    );
  }, []);

  const yearKris = useMemo(
    () => (data?.kris || []).filter((item) => !year || item.year === year),
    [data, year],
  );

  useEffect(() => {
    if (!data) return;
    if (side === "kri") {
      const list = data.kris.filter((item) => !year || item.year === year);
      const selected = list.find((item) => item.id === kriId) || list[0];
      if (selected && selected.id !== kriId) {
        setKriId(selected.id);
        return;
      }
      if (selected) setSelectedOrca(selected.orcaRiskIds || []);
      return;
    }
    const selected =
      data.orcaRisks.find((item) => item.id === orcaId) || data.orcaRisks[0];
    if (selected && selected.id !== orcaId) {
      setOrcaId(selected.id);
      return;
    }
    const mapped = data.kris
      .filter((item) => !year || item.year === year)
      .filter((item) => item.orcaRiskIds.includes(selected?.id || 0))
      .map((item) => item.id);
    setSelectedKri(mapped);
  }, [data, year, kriId, orcaId, side]);

  const save = async () => {
    if (side === "kri" && !kriId) return;
    if (side === "orca" && !orcaId) return;
    setSaving(true);
    setError("");
    setSaved("");
    try {
      if (side === "kri") {
        await api("/kri-mappings", {
          method: "PUT",
          body: JSON.stringify({ kriRecordId: kriId, orcaRiskIds: selectedOrca }),
        });
      } else {
        await api("/kri-mappings", {
          method: "PUT",
          body: JSON.stringify({
            orcaRiskId: orcaId,
            kriRecordIds: selectedKri,
            year: year || undefined,
          }),
        });
      }
      await load();
      setSaved("Mapping saved");
      setTimeout(() => setSaved(""), 2500);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save mapping");
    } finally {
      setSaving(false);
    }
  };

  const toggle = (list: number[], id: number, setList: (next: number[]) => void) =>
    setList(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);

  const kri = yearKris.find((item) => item.id === kriId);
  const orca = data?.orcaRisks.find((item) => item.id === orcaId);
  const needle = query.trim().toLowerCase();
  const filteredOrca = (data?.orcaRisks || []).filter((item) => {
    if (!needle) return true;
    return `${item.riskNo} ${item.process} ${item.riskThreat}`
      .toLowerCase()
      .includes(needle);
  });
  const filteredKris = yearKris.filter((item) => {
    if (!needle) return true;
    return `${item.riskCode} ${item.riskName} ${item.kriNumber} ${item.keyRiskIndicator}`
      .toLowerCase()
      .includes(needle);
  });

  return (
    <div className="modal">
      <div className="mapping-drawer mapping-drawer-wide">
        <div className="modalhead">
          <div>
            <h2>ORCA ↔ KRI mapping</h2>
            <p>
              {side === "kri"
                ? "KRIs on the left, Assessment 2026 ORCA risks on the right. Arrows show the risk source."
                : "ORCA risks on the left, KRIs on the right. Arrows show which indicators monitor that risk."}
            </p>
          </div>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>
        {!data ? (
          <p>Loading mapping…</p>
        ) : (
          <>
            <p className="kri-archive-note">
              The current KRIs predate Assessment 2026, so they start unmapped.
              Draw links here when the new KRIs launch.
            </p>
            <div className="mapping-controls">
              <label>
                <span>KRI year</span>
                <select
                  value={year}
                  onChange={(event) =>
                    setYear(event.target.value ? Number(event.target.value) : "")
                  }
                >
                  {data.sheets.map((sheet) => (
                    <option key={sheet.id} value={sheet.year}>
                      {sheet.year}
                      {sheet.status === "Archived" ? " (archived)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {side === "orca" && (
                <label className="wide">
                  <span>ORCA risk</span>
                  <select
                    value={orcaId}
                    onChange={(event) => setOrcaId(Number(event.target.value))}
                  >
                    {data.orcaRisks.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.riskNo} · {item.process} · {item.riskThreat}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="mapping-board">
              {side === "kri"
                ? yearKris.map((item) => {
                    const linkedIds =
                      item.id === kriId ? selectedOrca : item.orcaRiskIds;
                    const targets = data.orcaRisks
                      .filter((risk) => linkedIds.includes(risk.id))
                      .map((risk) => ({
                        id: risk.id,
                        title: `${risk.riskNo} · ${risk.process}`,
                        detail: risk.riskThreat,
                      }));
                    return (
                      <MappingFlow
                        key={item.id}
                        fromTitle={kriTitle(item)}
                        fromDetail={item.keyRiskIndicator}
                        fromActive={item.id === kriId}
                        onSelectFrom={() => setKriId(item.id)}
                        arrowLabel="sourced from"
                        targets={targets}
                        emptyLabel="Not mapped to Assessment 2026"
                        onRemoveTarget={
                          item.id === kriId
                            ? (id) =>
                                setSelectedOrca((current) =>
                                  current.filter((value) => value !== id),
                                )
                            : undefined
                        }
                      />
                    );
                  })
                : orca && (
                    <MappingFlow
                      fromTitle={`${orca.riskNo} · ${orca.process}`}
                      fromDetail={orca.riskThreat}
                      fromActive
                      arrowLabel="monitored by"
                      targets={yearKris
                        .filter((row) => selectedKri.includes(row.id))
                        .map((row) => ({
                          id: row.id,
                          title: kriTitle(row),
                          detail: row.keyRiskIndicator,
                        }))}
                      emptyLabel="No KRI mapped yet"
                      onRemoveTarget={(id) =>
                        setSelectedKri((current) =>
                          current.filter((value) => value !== id),
                        )
                      }
                    />
                  )}
            </div>
            <section className="mapping-picker">
              <h3>
                {side === "kri"
                  ? kri
                    ? `Link ORCA risks to ${kriTitle(kri)}`
                    : "Select a KRI"
                  : orca
                    ? `Link KRIs to ${orca.riskNo}`
                    : "Select an ORCA risk"}
              </h3>
              <input
                placeholder={
                  side === "kri"
                    ? "Search Assessment 2026 risks…"
                    : "Search KRIs…"
                }
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <div className="mapping-list">
                {side === "kri"
                  ? filteredOrca.map((item) => (
                      <label key={item.id}>
                        <input
                          type="checkbox"
                          checked={selectedOrca.includes(item.id)}
                          onChange={() =>
                            toggle(selectedOrca, item.id, setSelectedOrca)
                          }
                        />
                        <span>
                          <b>{item.riskNo}</b> · {item.processNo} {item.process}
                          <small>{item.riskThreat}</small>
                        </span>
                      </label>
                    ))
                  : filteredKris.map((item) => (
                      <label key={item.id}>
                        <input
                          type="checkbox"
                          checked={selectedKri.includes(item.id)}
                          onChange={() =>
                            toggle(selectedKri, item.id, setSelectedKri)
                          }
                        />
                        <span>
                          <b>{kriTitle(item)}</b>
                          <small>{item.keyRiskIndicator}</small>
                        </span>
                      </label>
                    ))}
                {side === "orca" && !yearKris.length && (
                  <p>No KRIs in this year.</p>
                )}
              </div>
            </section>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            {saved && <div className="toast">{saved}</div>}
            <div className="actions">
              <button type="button" onClick={onClose}>
                Close
              </button>
              <button
                className="primary"
                type="button"
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? "Saving…" : "Save mapping"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
