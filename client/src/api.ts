export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function api(path: string, init?: RequestInit) {
  const r = await fetch("/api" + path, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "DaxGov",
      ...init?.headers,
    },
  });
  let j: any = {};
  if (r.status !== 204) {
    try {
      j = await r.json();
    } catch {
      j = {};
    }
  }
  if (!r.ok) {
    const fields = j.details?.fieldErrors
      ? Object.values(j.details.fieldErrors).flat().filter(Boolean)
      : [];
    throw new ApiError(
      fields.length ? fields.join(" ") : j.error || "Request failed",
      r.status,
    );
  }
  return j;
}
export async function downloadActivityCsv() {
  const response = await fetch("/api/activity-log?format=csv", {
    credentials: "include",
    headers: { "X-Requested-With": "DaxGov" },
  });
  if (!response.ok) throw new Error("Unable to download the activity log");
  const blob = await response.blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "cybergov-activity-log.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}
export async function downloadBackup(fileName: string) {
  const response = await fetch(
    "/api/settings/backup/" + encodeURIComponent(fileName),
    { credentials: "include", headers: { "X-Requested-With": "DaxGov" } },
  );
  if (!response.ok) throw new Error("Unable to download the backup");
  const blob = await response.blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}

export async function uploadRestore(file: File, password: string) {
  const response = await fetch("/api/settings/restore-upload", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Requested-With": "DaxGov",
      "X-Confirm-Password": password,
    },
    body: file,
  });
  const json = response.status === 204 ? {} : await response.json();
  if (!response.ok)
    throw new Error(json.error || "Unable to restore the backup");
  return json;
}

export function csv(
  rows: any[],
  name: string,
  columns?: { key: string; header: string }[],
) {
  const keys = columns?.map((column) => column.key) ??
    (rows[0]
      ? Object.keys(rows[0]).filter((key) => typeof rows[0][key] !== "object")
      : []);
  const headers = columns?.map((column) => column.header) ?? keys;
  if (!keys.length) return;
  const safe = (v: any) => {
    let s = String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return `"${s.replaceAll('"', '""')}"`;
  };
  const blob = new Blob(
    [
      [
        headers.join(","),
        ...rows.map((r) => keys.map((k) => safe(r[k])).join(",")),
      ].join("\n"),
    ],
    { type: "text/csv" },
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name + ".csv";
  a.click();
  URL.revokeObjectURL(a.href);
}
