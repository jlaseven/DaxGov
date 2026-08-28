import { describe, expect, it } from "vitest";
import {
  firstAllowedPath,
  pageKeyForPath,
  pageLabel,
  PAGE_PATHS,
  userCanOpen,
  type SessionUser,
} from "../../client/src/pages";

const admin: SessionUser = {
  id: 1,
  username: "admin",
  displayName: "Administrator",
  role: "Admin",
  status: "Active",
  allowedPages: [],
};

const analyst: SessionUser = {
  id: 2,
  username: "analyst",
  displayName: "Analyst",
  role: "User",
  status: "Active",
  allowedPages: ["dashboard", "orca", "kris"],
};

describe("SPA page access", () => {
  it("maps every grantable route to a page key", () => {
    expect(pageKeyForPath("/")).toBe("dashboard");
    expect(pageKeyForPath("/orca")).toBe("orca");
    expect(pageKeyForPath("/isra/daxon-answers")).toBe("isra");
    expect(pageKeyForPath("/users")).toBe("user-management");
    expect(pageKeyForPath("/unknown")).toBeNull();
    expect(PAGE_PATHS.map(([key]) => key)).toContain("settings");
  });

  it("sends Admins to the dashboard and Users to their first granted page", () => {
    expect(firstAllowedPath(admin)).toBe("/");
    expect(firstAllowedPath(analyst)).toBe("/");
    expect(
      firstAllowedPath({
        ...analyst,
        allowedPages: ["kris"],
      }),
    ).toBe("/kris");
    expect(firstAllowedPath(null)).toBe("/login");
  });

  it("hides admin-only and ungranted pages from a User", () => {
    expect(userCanOpen(admin, "user-management")).toBe(true);
    expect(userCanOpen(admin, "settings-restore")).toBe(true);
    expect(userCanOpen(analyst, "user-management")).toBe(false);
    expect(userCanOpen(analyst, "documents")).toBe(false);
    expect(userCanOpen(analyst, "orca")).toBe(true);
    expect(userCanOpen(null, "dashboard")).toBe(false);
  });

  it("uses the sidebar labels for known pages", () => {
    expect(pageLabel("orca")).toBe("ORCA");
    expect(pageLabel("information-assets")).toBe("Information Asset Inventory");
    expect(pageLabel("not-a-page")).toBe("not-a-page");
  });
});
