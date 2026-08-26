import { AsyncLocalStorage } from "node:async_hooks";
import type { ActivityLog, PrismaClient } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";

export const ACTIVITY_APPLICATION = "cybergov";

export const ACTIVITY_CSV_COLUMNS = [
  "timestamp",
  "application",
  "event_type",
  "action",
  "outcome",
  "severity",
  "actor_id",
  "actor_username",
  "actor_role",
  "src_ip",
  "target_type",
  "target_id",
  "target_name",
  "http_method",
  "http_path",
  "http_status",
  "fields_changed",
  "previous_value",
  "new_value",
] as const;

export type ActivityCsvColumn = (typeof ACTIVITY_CSV_COLUMNS)[number];
export type ActivityCsvRow = Record<ActivityCsvColumn, string>;

export type AuditContext = {
  actorId?: string;
  actorUsername?: string;
  actorRole?: string;
  srcIp?: string;
  httpMethod?: string;
  httpPath?: string;
};

export type LogExtras = {
  targetName?: string;
  outcome?: "success" | "failure" | "denied";
  severity?: "info" | "low" | "medium" | "high";
  fieldsChanged?: string | string[];
  httpStatus?: number;
  eventType?: string;
  actorId?: string;
  actorUsername?: string;
  actorRole?: string;
};

const auditContext = new AsyncLocalStorage<AuditContext>();
const SECRET_KEY = /password|hash|token|secret|cookie|session/i;
const ENTITY_ALIASES: Record<string, string> = {
  documents: "document",
  "opir-actions": "opir-action",
  "audit-findings": "audit-finding",
  objectives: "objective",
  "okr-tasks": "okr-task",
  initiatives: "initiative",
  "sub-initiatives": "sub-initiative",
  settings: "settings",
  user: "user",
  users: "user",
  auth: "auth",
  "tpsa-records": "tpsa-record",
  TpsaRecord: "tpsa-record",
  "tpsa-certification": "tpsa-certification",
  "tpsa-follow-up": "tpsa-follow-up",
  "isra-assessments": "isra-assessment",
  "isra-risks": "isra-risk",
  "information-assets": "information-asset",
  orca: "orca-risk",
  "kri-records": "kri-record",
  "kri-sheets": "kri-sheet",
  "kri-mappings": "kri-mapping",
  WorkbookMigration: "workbook-migration",
};
const VERB_ALIASES: Record<string, string> = {
  created: "create",
  edited: "update",
  updated: "update",
  archived: "archive",
  restored: "restore",
  removed: "delete",
  deleted: "delete",
  disabled: "disable",
  enabled: "enable",
  imported: "import",
  "password reset": "password_reset",
  "isra imported": "import",
  "isra version activated": "activate",
  "isra risk updated": "update",
  "web research completed": "research",
  "database backup created": "backup",
  "database restored": "restore",
  "database restored from upload": "restore_upload",
  "duplicated for reassessment": "reassessment",
  "final verdict changed": "verdict_change",
  "vendor tier changed": "tier_change",
  "deadline changed": "deadline_change",
  "raf link changed": "raf_link_change",
  "field changed": "field_change",
  "information asset updated": "update",
};

export function runWithAuditContext<T>(context: AuditContext, fn: () => T) {
  return auditContext.run(context, fn);
}

export function withAuditContext() {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = res.locals.user as
      | { id: number; username: string; role: string }
      | undefined;
    const path = String(req.originalUrl || req.url || "").split("?")[0];
    runWithAuditContext(
      {
        actorId: user ? String(user.id) : undefined,
        actorUsername: user?.username,
        actorRole: user?.role,
        srcIp: req.ip || undefined,
        httpMethod: req.method,
        httpPath: path,
      },
      () => next(),
    );
  };
}

export function normalizeEntityType(type: string) {
  const trimmed = String(type || "").trim();
  if (ENTITY_ALIASES[trimmed]) return ENTITY_ALIASES[trimmed];
  return trimmed
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase()
    .replace(/s$/, (match, offset, value) =>
      value.endsWith("ss") ? match : "",
    );
}

export function normalizeAction(type: string, action: string) {
  const entity = normalizeEntityType(type);
  const raw = String(action || "").trim();
  if (!raw) return `${entity}.update`;
  if (raw.includes(".")) return raw.toLowerCase();
  const verb =
    VERB_ALIASES[raw.toLowerCase()] ||
    raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") ||
    "update";
  return `${entity}.${verb}`;
}

export function severityFor(action: string, outcome = "success") {
  if (outcome === "denied" || action.endsWith(".failure")) return "medium";
  if (
    action.endsWith(".delete") ||
    action.endsWith(".restore") ||
    action.endsWith(".restore_upload")
  )
    return "high";
  if (
    action.endsWith(".disable") ||
    action.endsWith(".password_reset") ||
    action.endsWith(".create") ||
    action.startsWith("auth.")
  )
    return "medium";
  if (action.endsWith(".archive")) return "low";
  return "info";
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (SECRET_KEY.test(key)) continue;
      out[key] = redact(nested);
    }
    return out;
  }
  return value;
}

export function compactJson(value: unknown, max = 2000) {
  if (value == null || value === "") return null;
  const redacted = redact(value);
  const text =
    typeof redacted === "string" ? redacted : JSON.stringify(redacted);
  if (text.length <= max) return text;
  return JSON.stringify({ truncated: true, length: text.length });
}

function fieldsChangedToString(value?: string | string[] | null) {
  if (!value) return null;
  if (Array.isArray(value))
    return value.filter(Boolean).join(",") || null;
  return value;
}

export function formatActivityRow(
  row: Partial<ActivityLog> & {
    entityType?: string;
    entityId?: string;
    action?: string;
    createdAt?: Date | string;
  },
): ActivityCsvRow {
  const timestamp =
    row.createdAt instanceof Date
      ? row.createdAt.toISOString()
      : String(row.createdAt || "");
  return {
    timestamp,
    application: ACTIVITY_APPLICATION,
    event_type: row.eventType || "activity",
    action: row.action || "",
    outcome: row.outcome || "success",
    severity: row.severity || "info",
    actor_id: row.actorId || "",
    actor_username: row.actorUsername || "",
    actor_role: row.actorRole || "",
    src_ip: row.srcIp || "",
    target_type: row.entityType || "",
    target_id: row.entityId || "",
    target_name: row.targetName || "",
    http_method: row.httpMethod || "",
    http_path: row.httpPath || "",
    http_status: row.httpStatus != null ? String(row.httpStatus) : "",
    fields_changed: row.fieldChanged || "",
    previous_value: row.previousValue || "",
    new_value: row.newValue || "",
  };
}

export function httpMethodFromLog(row: Pick<ActivityCsvRow, "http_method" | "action">) {
  const stored = String(row.http_method || "").toUpperCase();
  if (stored) return stored;
  const action = String(row.action || "");
  if (action.endsWith(".list") || action.endsWith(".read")) return "GET";
  if (action.endsWith(".create")) return "POST";
  if (action.endsWith(".update") || action.endsWith(".field_change")) return "PUT";
  if (action.endsWith(".delete")) return "DELETE";
  if (
    action.endsWith(".disable") ||
    action.endsWith(".enable") ||
    action.endsWith(".password_reset")
  )
    return "POST";
  return "POST";
}

export function httpPathFromLog(
  row: Pick<ActivityCsvRow, "http_path" | "action" | "target_id">,
) {
  if (row.http_path) return row.http_path;
  const id = row.target_id || "";
  const action = String(row.action || "");
  if (action.endsWith(".list") || id === "list") return "/api/users";
  if (action.endsWith(".create")) return "/api/users";
  if (action.endsWith(".disable")) return `/api/users/${id}/disable`;
  if (action.endsWith(".enable")) return `/api/users/${id}/enable`;
  if (action.endsWith(".password_reset"))
    return `/api/users/${id}/reset-password`;
  if (id) return `/api/users/${id}`;
  return "/api/users";
}

export function toUserAccessLog(row: ActivityCsvRow) {
  return {
    timestamp: row.timestamp,
    method: httpMethodFromLog(row),
    path: httpPathFromLog(row),
    status: row.http_status,
    actor: row.actor_username,
    actor_role: row.actor_role,
    target: row.target_name || row.target_id,
    action: row.action,
    outcome: row.outcome,
  };
}

function csvCell(value: string) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function toActivityCsv(rows: ActivityCsvRow[]) {
  return [
    ACTIVITY_CSV_COLUMNS.join(","),
    ...rows.map((row) =>
      ACTIVITY_CSV_COLUMNS.map((column) => csvCell(row[column])).join(","),
    ),
  ].join("\n");
}

export type LogFn = (
  type: string,
  id: number | string,
  action: string,
  prev?: unknown,
  next?: unknown,
  extras?: LogExtras,
) => Promise<void>;

export function createLogger(prisma: PrismaClient): LogFn {
  return async function log(type, id, action, prev, next, extras) {
    const context = auditContext.getStore() || {};
    const entityType = normalizeEntityType(type);
    const actionName = normalizeAction(type, action);
    const outcome = extras?.outcome || "success";
    const fieldChanged =
      fieldsChangedToString(extras?.fieldsChanged) ||
      (prev && next && typeof prev === "object" && typeof next === "object"
        ? Object.keys(next as object).join(",")
        : null);
    await prisma.activityLog.create({
      data: {
        entityType,
        entityId: String(id),
        action: actionName,
        fieldChanged,
        previousValue: compactJson(prev),
        newValue: compactJson(next),
        eventType: extras?.eventType || "activity",
        outcome,
        severity: extras?.severity || severityFor(actionName, outcome),
        actorId: extras?.actorId || context.actorId || null,
        actorUsername: extras?.actorUsername || context.actorUsername || null,
        actorRole: extras?.actorRole || context.actorRole || null,
        srcIp: context.srcIp || null,
        targetName: extras?.targetName || null,
        httpMethod: context.httpMethod || null,
        httpPath: context.httpPath || null,
        httpStatus: extras?.httpStatus ?? null,
      },
    });
  };
}
