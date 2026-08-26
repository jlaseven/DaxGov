import { describe, expect, it } from "vitest";
import {
  ACTIVITY_CSV_COLUMNS,
  compactJson,
  formatActivityRow,
  httpMethodFromLog,
  httpPathFromLog,
  normalizeAction,
  normalizeEntityType,
  severityFor,
  toActivityCsv,
  toUserAccessLog,
} from "../server/activityLog";

describe("activity log columns", () => {
  it("uses a stable CSV header order", () => {
    expect([...ACTIVITY_CSV_COLUMNS]).toEqual([
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
    ]);
    const csv = toActivityCsv([
      formatActivityRow({
        entityType: "user",
        entityId: "2",
        action: "user.create",
        createdAt: new Date("2026-08-17T06:00:00.000Z"),
        eventType: "activity",
        outcome: "success",
        severity: "medium",
        actorUsername: "admin",
        targetName: "analyst",
        fieldChanged: "role,status",
        previousValue: null,
        newValue: '{"role":"User"}',
      }),
    ]);
    expect(csv.split("\n")[0]).toBe(ACTIVITY_CSV_COLUMNS.join(","));
    expect(csv).toContain("cybergov");
    expect(csv).toContain("user.create");
    expect(csv).toContain("analyst");
  });

  it("normalizes entity types and actions into dotted verbs", () => {
    expect(normalizeEntityType("tpsa-records")).toBe("tpsa-record");
    expect(normalizeEntityType("TpsaRecord")).toBe("tpsa-record");
    expect(normalizeEntityType("documents")).toBe("document");
    expect(normalizeAction("user", "Created")).toBe("user.create");
    expect(normalizeAction("user", "Password Reset")).toBe("user.password_reset");
    expect(normalizeAction("auth", "auth.login.failure")).toBe(
      "auth.login.failure",
    );
    expect(severityFor("user.delete")).toBe("high");
    expect(severityFor("auth.login.failure", "failure")).toBe("medium");
  });

  it("redacts secrets and keeps JSON valid when values are large", () => {
    expect(
      compactJson({
        username: "admin",
        password: "secret",
        passwordHash: "hash",
        token: "abc",
      }),
    ).toBe('{"username":"admin"}');
    const truncated = compactJson("x".repeat(5000), 20);
    expect(truncated).toContain("truncated");
    expect(() => JSON.parse(truncated!)).not.toThrow();
  });

  it("maps older rows onto the CSV columns", () => {
    const row = formatActivityRow({
      entityType: "TpsaRecord",
      entityId: "9",
      action: "Created",
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      fieldChanged: null,
      previousValue: null,
      newValue: null,
    });
    expect(row.application).toBe("cybergov");
    expect(row.target_type).toBe("TpsaRecord");
    expect(row.target_id).toBe("9");
    expect(row.event_type).toBe("activity");
    expect(row.outcome).toBe("success");
    expect(Object.keys(row)).toEqual([...ACTIVITY_CSV_COLUMNS]);
  });

  it("presents user management events as HTTP method, path, and status", () => {
    const created = toUserAccessLog(
      formatActivityRow({
        entityType: "user",
        entityId: "4",
        action: "user.create",
        createdAt: new Date("2026-08-17T07:00:00.000Z"),
        actorUsername: "admin",
        actorRole: "Admin",
        targetName: "analyst",
        httpMethod: "POST",
        httpPath: "/api/users",
        httpStatus: 201,
      }),
    );
    expect(created).toMatchObject({
      method: "POST",
      path: "/api/users",
      status: "201",
      actor: "admin",
      target: "analyst",
    });
    expect(httpMethodFromLog({ http_method: "", action: "user.delete" })).toBe(
      "DELETE",
    );
    expect(
      httpPathFromLog({
        http_path: "",
        action: "user.disable",
        target_id: "8",
      }),
    ).toBe("/api/users/8/disable");
    expect(httpMethodFromLog({ http_method: "GET", action: "user.read" })).toBe(
      "GET",
    );
  });
});
