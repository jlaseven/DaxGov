import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
const storageKey = "cybergov-theme";
export const themeEvent = "cybergov-theme";

export function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // Private browsing can block localStorage.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function appliedTheme(): Theme {
  const current = document.documentElement.dataset.theme;
  return current === "dark" || current === "light" ? current : readTheme();
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(storageKey, theme);
  } catch {
    // Keep the in-memory theme even if storage is unavailable.
  }
  window.dispatchEvent(new Event(themeEvent));
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(appliedTheme);
  useEffect(() => {
    const sync = () => setThemeState(appliedTheme());
    window.addEventListener(themeEvent, sync);
    return () => window.removeEventListener(themeEvent, sync);
  }, []);
  return [theme, applyTheme] as const;
}

export function badgeClass(text: string) {
  const slug = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? "badge " + slug : "badge";
}

export function chartTheme(theme: Theme) {
  return theme === "dark"
    ? {
        grid: "#2a3f59",
        tick: "#9fb2c8",
        tooltipBg: "#12233a",
        tooltipBorder: "#2a3f59",
        tooltipColor: "#e8eef7",
      }
    : {
        grid: "#dce3ed",
        tick: "#52647b",
        tooltipBg: "#ffffff",
        tooltipBorder: "#e0e7f0",
        tooltipColor: "#18243b",
      };
}
