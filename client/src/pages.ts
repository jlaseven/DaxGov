export const GRANTABLE_PAGES = [
  "dashboard",
  "tpsa-monitoring",
  "isra",
  "isra-assessment",
  "orca",
  "kris",
  "information-assets",
  "documents",
  "opir-actions",
  "audit-findings",
  "objectives",
  "initiatives",
  "activity-log",
  "settings",
  "regulatory-guide",
] as const;

export const PAGE_GROUPS: { label: string; pages: [string, string][] }[] = [
  { label: "Overview", pages: [["dashboard", "Dashboard"]] },
  {
    label: "Risk and vendors",
    pages: [
      ["tpsa-monitoring", "TPSA Monitoring"],
      ["isra", "ISRA SPOG"],
      ["isra-assessment", "ISRA Assessment"],
      ["orca", "ORCA"],
      ["kris", "KRIs"],
      ["information-assets", "Information Asset Inventory"],
      ["regulatory-guide", "Regulatory Guide"],
    ],
  },
  {
    label: "Registers",
    pages: [
      ["documents", "Governance Documents"],
      ["opir-actions", "OPIR Actions"],
      ["audit-findings", "Audit Findings"],
      ["objectives", "OKRs"],
      ["initiatives", "Initiatives"],
    ],
  },
  {
    label: "Operations",
    pages: [
      ["activity-log", "Activity Log"],
      ["settings", "Settings (view)"],
    ],
  },
];

export const PAGE_PATHS: [string, string][] = [
  ["dashboard", "/"],
  ["tpsa-monitoring", "/tpsa-monitoring"],
  ["isra", "/isra"],
  ["isra-assessment", "/isra-assessment"],
  ["orca", "/orca"],
  ["kris", "/kris"],
  ["information-assets", "/information-assets"],
  ["regulatory-guide", "/regulatory-guide"],
  ["documents", "/documents"],
  ["opir-actions", "/opir-actions"],
  ["audit-findings", "/audit-findings"],
  ["objectives", "/objectives"],
  ["initiatives", "/initiatives"],
  ["activity-log", "/activity-log"],
  ["settings", "/settings"],
];

export type SessionUser = {
  id: number;
  username: string;
  displayName: string;
  role: "Admin" | "User";
  status: string;
  allowedPages: string[];
  isAdmin?: boolean;
  mustChangePassword?: boolean;
  researchEnabled?: boolean;
};

export function isAdmin(user: SessionUser | null | undefined) {
  return user?.role === "Admin";
}

export function userCanOpen(
  user: SessionUser | null | undefined,
  page: string,
) {
  if (!user) return false;
  if (page === "user-management" || page === "settings-restore")
    return user.role === "Admin";
  if (user.role === "Admin") return true;
  return user.allowedPages.includes(page);
}

export function pageKeyForPath(pathname: string) {
  if (pathname === "/") return "dashboard";
  if (pathname === "/users" || pathname.startsWith("/user-management"))
    return "user-management";
  if (pathname.startsWith("/isra/daxon-answers") || pathname === "/isra")
    return "isra";
  const match = PAGE_PATHS.find(
    ([, path]) => pathname === path || pathname.startsWith(path + "/"),
  );
  return match?.[0] || null;
}

export function firstAllowedPath(user: SessionUser | null | undefined) {
  if (!user) return "/login";
  if (user.role === "Admin") return "/";
  for (const [key, path] of PAGE_PATHS) {
    if (user.allowedPages.includes(key)) return path;
  }
  return "/";
}

export function pageLabel(key: string) {
  for (const group of PAGE_GROUPS) {
    const found = group.pages.find(([page]) => page === key);
    if (found) return found[1];
  }
  return key;
}
