import { useEffect, useState } from "react";
import { api } from "./api";
import { useAuth } from "./auth";

type DepartmentRow = {
  id: number;
  name: string;
  departmentKey: string;
  assessmentCount: number;
  assetCount: number;
};

export function DepartmentsManager({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { user } = useAuth();
  const canManage = user?.role === "Admin";
  const [rows, setRows] = useState<DepartmentRow[]>([]);
  const [name, setName] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = async () => {
    const response = await api("/departments");
    setRows(response.data || []);
  };

  useEffect(() => {
    if (!open) return;
    setError("");
    setEditId(null);
    setName("");
    void load().catch((reason) =>
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load departments.",
      ),
    );
  }, [open]);

  if (!open) return null;

  const notify = () => onChanged?.();

  const save = async () => {
    const value = name.trim();
    if (!value) return setError("Enter a department name.");
    setBusy(editId ? "save" : "add");
    setError("");
    try {
      if (editId) {
        await api(`/departments/${editId}`, {
          method: "PUT",
          body: JSON.stringify({ name: value }),
        });
      } else {
        await api("/departments", {
          method: "POST",
          body: JSON.stringify({ name: value }),
        });
      }
      setName("");
      setEditId(null);
      await load();
      notify();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to save the department.",
      );
    } finally {
      setBusy("");
    }
  };

  const remove = async (row: DepartmentRow) => {
    const extra = [];
    if (row.assessmentCount)
      extra.push(
        `${row.assessmentCount} ISRA assessment${row.assessmentCount === 1 ? "" : "s"}`,
      );
    if (row.assetCount)
      extra.push(
        `${row.assetCount} information asset${row.assetCount === 1 ? "" : "s"}`,
      );
    if (
      !confirm(
        extra.length
          ? `Delete ${row.name}? This also deletes ${extra.join(" and ")}.`
          : `Delete department ${row.name}?`,
      )
    )
      return;
    setBusy(`delete-${row.id}`);
    setError("");
    try {
      await api(`/departments/${row.id}`, { method: "DELETE" });
      if (editId === row.id) {
        setEditId(null);
        setName("");
      }
      await load();
      notify();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to delete the department.",
      );
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="modal">
      <div className="department-manager">
        <div className="modalhead">
          <div>
            <h2>Departments</h2>
            <p>
              {canManage
                ? "Add, rename, or delete departments used by ISRA and the inventory."
                : "Departments used by ISRA and the inventory. Only Administrators can change this list."}
            </p>
          </div>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>
        {canManage && (
        <div className="department-manager-form">
          <label>
            {editId ? "Rename department" : "New department"}
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Information Security"
            />
          </label>
          <button
            className="primary"
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void save()}
          >
            {busy === "add" || busy === "save"
              ? "Saving…"
              : editId
                ? "Save name"
                : "Add"}
          </button>
          {editId && (
            <button
              type="button"
              onClick={() => {
                setEditId(null);
                setName("");
              }}
            >
              Cancel
            </button>
          )}
        </div>
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Department</th>
                <th>Assessments</th>
                <th>Assets</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.assessmentCount}</td>
                  <td>{row.assetCount}</td>
                  <td>
                    {canManage ? (
                    <div className="row-actions">
                      <button
                        type="button"
                        onClick={() => {
                          setEditId(row.id);
                          setName(row.name);
                          setError("");
                        }}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        disabled={busy === `delete-${row.id}`}
                        onClick={() => void remove(row)}
                      >
                        Delete
                      </button>
                    </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={4} className="empty-state">
                    No departments yet. Add one to use it in ISRA and the
                    inventory.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
