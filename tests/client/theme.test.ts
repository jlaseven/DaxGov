import { describe, expect, it } from "vitest";
import { applyTheme, badgeClass, chartTheme, readTheme } from "../../client/src/theme";

describe("theme helpers", () => {
  it("reads a stored theme and applies it to the document", () => {
    localStorage.setItem("cybergov-theme", "dark");
    expect(readTheme()).toBe("dark");
    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("cybergov-theme")).toBe("light");
  });

  it("builds badge class names and chart palettes", () => {
    expect(badgeClass("In Progress – At Risk")).toBe("badge in-progress-at-risk");
    expect(badgeClass("")).toBe("badge");
    expect(chartTheme("dark").tick).toBe("#9fb2c8");
    expect(chartTheme("light").tooltipBg).toBe("#ffffff");
  });
});
