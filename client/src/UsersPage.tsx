import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "./api";
import {
  GRANTABLE_PAGES,
  PAGE_GROUPS,
  pageLabel,
  type SessionUser,
} from "./pages";

type UserRecord = SessionUser & {
  lastLoginAt?: string | null;
};

type AccessLog = {
  timestamp: string;
  method: string;
  path: string;
  status: string;
  actor: string;
  actor_role: string;
  target: string;
  action: string;
  outcome: string;
};

const emptyForm = {
  username: "",
  displayName: "",
  password: "",
  role: "User" as "Admin" | "User",
  status: "Active" as "Active" | "Disabled",
  allowedPages: ["dashboard"] as string[],
};

export default function UsersPage() {
  const [rows, setRows] = useState<UserRecord[]>([]);
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<UserRecord | null | "new">(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [usersResponse, logsResponse] = await Promise.all([
      api("/users"),
      api("/users/logs"),
    ]);
    setRows(usersResponse.data);
    setLogs(logsResponse.data);
  };

  useEffect(() => {
    void load().catch((reason) =>
      setError(reason instanceof Error ? reason.message : "Unable to load users"),
    );
  }, []);

  const openCreate = () => {
    setForm(emptyForm);
    setEditing("new");
    setError("");
  };

  const openEdit = (user: UserRecord) => {
    setForm({
      username: user.username,
      displayName: user.displayName,
      password: "",
      role: user.role,
      status: (user.status as "Active" | "Disabled") || "Active",
      allowedPages:
        user.role === "Admin"
          ? [...GRANTABLE_PAGES]
          : user.allowedPages.filter((page) =>
              (GRANTABLE_PAGES as readonly string[]).includes(page),
            ),
    });
    setEditing(user);
    setError("");
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (form.role === "User" && form.allowedPages.length < 1) {
        throw new Error("Select at least one page for a User account");
      }
      if (editing === "new") {
        await api("/users", {
          method: "POST",
          body: JSON.stringify({
            username: form.username,
            displayName: form.displayName,
            password: form.password,
            role: form.role,
            status: form.status,
            allowedPages: form.role === "User" ? form.allowedPages : [],
          }),
        });
      } else if (editing) {
        await api(`/users/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify({
            displayName: form.displayName,
            role: form.role,
            status: form.status,
            allowedPages: form.role === "User" ? form.allowedPages : [],
            ...(form.password ? { password: form.password } : {}),
          }),
        });
      }
      setEditing(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save user");
    } finally {
      setBusy(false);
    }
  };

  const run = async (work: () => Promise<void>) => {
    setError("");
    try {
      await work();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update user");
    }
  };

  const togglePage = (page: string) => {
    setForm((current) => ({
      ...current,
      allowedPages: current.allowedPages.includes(page)
        ? current.allowedPages.filter((item) => item !== page)
        : [...current.allowedPages, page],
    }));
  };

  const groups = useMemo(() => PAGE_GROUPS, []);

  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <h1>User Management</h1>
          <p>Create local accounts and choose which pages each User may open.</p>
        </div>
        <button className="primary" onClick={openCreate}>
          New user
        </button>
      </div>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <section className="panel">
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Display name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Allowed pages</th>
                <th>Last login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((user) => (
                <tr key={user.id}>
                  <td>{user.username}</td>
                  <td>{user.displayName}</td>
                  <td>{user.role}</td>
                  <td>{user.status}</td>
                  <td>
                    {user.role === "Admin"
                      ? "All pages"
                      : user.allowedPages.map(pageLabel).join(", ") || "None"}
                  </td>
                  <td>
                    {user.lastLoginAt
                      ? new Date(user.lastLoginAt).toLocaleString()
                      : "Never"}
                  </td>
                  <td className="row-actions">
                    <button onClick={() => openEdit(user)}>Edit</button>
                    {user.status === "Active" ? (
                      <button
                        onClick={() => {
                          if (!confirm(`Disable ${user.username}? They will be signed out immediately.`))
                            return;
                          void run(() =>
                            api(`/users/${user.id}/disable`, { method: "POST" }).then(
                              () => undefined,
                            ),
                          );
                        }}
                      >
                        Disable
                      </button>
                    ) : (
                      <button
                        onClick={() =>
                          void run(() =>
                            api(`/users/${user.id}/enable`, { method: "POST" }).then(
                              () => undefined,
                            ),
                          )
                        }
                      >
                        Enable
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (
                          !confirm(
                            `Delete ${user.username}? Prefer Disable unless this account should be removed.`,
                          )
                        )
                          return;
                        void run(() =>
                          api(`/users/${user.id}`, { method: "DELETE" }).then(
                            () => undefined,
                          ),
                        );
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={7} className="empty-state">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h2>User management log</h2>
        <p>Account changes as HTTP requests: method, path, and status.</p>
        <div className="tablewrap access-log">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Method</th>
                <th>Path</th>
                <th>Status</th>
                <th>Actor</th>
                <th>Target</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((entry, index) => (
                <tr key={entry.timestamp + entry.method + entry.path + index}>
                  <td>
                    {entry.timestamp
                      ? new Date(entry.timestamp).toLocaleString()
                      : "—"}
                  </td>
                  <td>
                    <span
                      className={
                        "http-method " + entry.method.toLowerCase()
                      }
                    >
                      {entry.method}
                    </span>
                  </td>
                  <td className="access-path">{entry.path}</td>
                  <td>{entry.status || "—"}</td>
                  <td>
                    {entry.actor || "—"}
                    {entry.actor_role ? ` (${entry.actor_role})` : ""}
                  </td>
                  <td>{entry.target || "—"}</td>
                </tr>
              ))}
              {!logs.length && (
                <tr>
                  <td colSpan={6} className="empty-state">
                    No user management requests recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {editing && (
        <div className="modal">
          <form className="modal-card user-form" onSubmit={save}>
            <div className="modalhead">
              <h2>{editing === "new" ? "New user" : "Edit user"}</h2>
              <button type="button" onClick={() => setEditing(null)}>
                Close
              </button>
            </div>
            <label>
              Username
              <input
                value={form.username}
                onChange={(event) =>
                  setForm({ ...form, username: event.target.value })
                }
                required
                disabled={editing !== "new"}
                autoComplete="off"
              />
            </label>
            <label>
              Display name
              <input
                value={form.displayName}
                onChange={(event) =>
                  setForm({ ...form, displayName: event.target.value })
                }
                required
              />
            </label>
            <label>
              {editing === "new" ? "Password" : "New password (optional)"}
              <input
                type="password"
                value={form.password}
                onChange={(event) =>
                  setForm({ ...form, password: event.target.value })
                }
                required={editing === "new"}
                minLength={editing === "new" ? 12 : undefined}
                autoComplete="new-password"
              />
              <small>
                At least 12 characters, with letters and numbers. Cannot match
                the username or the bootstrap password.
              </small>
            </label>
            <label>
              Role
              <select
                value={form.role}
                onChange={(event) =>
                  setForm({
                    ...form,
                    role: event.target.value as "Admin" | "User",
                    allowedPages:
                      event.target.value === "Admin"
                        ? [...GRANTABLE_PAGES]
                        : form.allowedPages.length
                          ? form.allowedPages
                          : ["dashboard"],
                  })
                }
              >
                <option>User</option>
                <option>Admin</option>
              </select>
            </label>
            <label>
              Status
              <select
                value={form.status}
                onChange={(event) =>
                  setForm({
                    ...form,
                    status: event.target.value as "Active" | "Disabled",
                  })
                }
              >
                <option>Active</option>
                <option>Disabled</option>
              </select>
            </label>
            {form.role === "User" && (
              <fieldset className="page-access">
                <legend>Page access</legend>
                <div className="actions">
                  <button
                    type="button"
                    onClick={() =>
                      setForm({ ...form, allowedPages: [...GRANTABLE_PAGES] })
                    }
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, allowedPages: [] })}
                  >
                    Clear
                  </button>
                </div>
                {groups.map((group) => (
                  <div key={group.label} className="page-access-group">
                    <h3>{group.label}</h3>
                    {group.pages.map(([key, label]) => (
                      <label key={key} className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={form.allowedPages.includes(key)}
                          onChange={() => togglePage(key)}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                ))}
                <p>User Management and database restore cannot be granted to a User.</p>
              </fieldset>
            )}
            <div className="actions">
              <button className="primary" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
              <button type="button" onClick={() => setEditing(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
