import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "../../client/src/pages";

const authState = {
  user: null as SessionUser | null,
  loading: false,
  refresh: vi.fn(),
  signOut: vi.fn(),
};

vi.mock("../../client/src/auth", () => ({
  useAuth: () => authState,
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

vi.mock("../../client/src/api", () => ({
  api: vi.fn(async (path: string) => {
    if (path === "/dashboard") {
      return {
        data: {
          kpis: {
            totalTpsa: 0,
            overdueTpsa: 0,
            readyToSendTpsa: 0,
            totalIsraRisks: 0,
            criticalIsraRisks: 0,
            overdueIsraActions: 0,
            totalDocuments: 0,
            updatedDocuments: 0,
            outdatedDocuments: 0,
            updatingDocuments: 0,
            nonExistentDocuments: 0,
            decommissioningDocuments: 0,
            openOpir: 0,
            overdueOpir: 0,
            noTcdOpir: 0,
            openFindings: 0,
            highRiskFindings: 0,
            activeOkrs: 0,
            completedInitiatives: 0,
          },
          charts: {
            tpsaByStatus: [],
            israByRating: [],
            documentsByPillar: [],
            opirRisk: [],
            auditRisk: [],
            okrStatus: [],
            initiativeStatus: [],
            documentStatusPies: {
              overall: [],
              procedure: [],
              policy: [],
              framework: [],
              other: [],
              counts: { procedure: 0, policy: 0, framework: 0, other: 0 },
            },
          },
          activity: [],
        },
      };
    }
    if (path === "/settings/database") {
      return {
        data: {
          fileBackups: false,
          label: "Aurora Serverless (PostgreSQL)",
          host: "daxgov.cluster.rds.amazonaws.com",
          database: "daxgov",
          session: { ttlMs: 1000, slideAfterMs: 500, absoluteTtlMs: 8000, concurrent: false },
          rateLimits: {
            login: { limit: 5, windowMs: 1000 },
            accountLock: { failures: 8, lockMs: 1000 },
            passwordChange: { limit: 5, windowMs: 1000 },
            sso: { limit: 20, windowMs: 1000 },
            api: { limit: 300, windowMs: 1000 },
          },
        },
      };
    }
    if (path === "/auth/sso")
      return { data: { jumpcloud: false, passwordLogin: true } };
    return { data: [], meta: { unread: 0 } };
  }),
  csv: vi.fn(),
  downloadActivityCsv: vi.fn(),
  downloadBackup: vi.fn(),
  uploadRestore: vi.fn(),
}));

vi.mock("../../client/src/IsraPage", () => ({ default: () => <div>ISRA page</div> }));
vi.mock("../../client/src/IsraAssessmentPage", () => ({
  default: () => <div>ISRA assessment page</div>,
}));
vi.mock("../../client/src/DaxonAnswersPage", () => ({
  default: () => <div>Daxon answers page</div>,
}));
vi.mock("../../client/src/InformationAssetInventoryPage", () => ({
  default: () => <div>Assets page</div>,
}));
vi.mock("../../client/src/RegisterPage", () => ({
  default: ({ type }: { type: string }) => <div>Register {type}</div>,
}));
vi.mock("../../client/src/UsersPage", () => ({ default: () => <div>Users page</div> }));
vi.mock("../../client/src/RegulatoryGuidePage", () => ({
  default: () => <div>Regulatory guide page</div>,
}));
vi.mock("../../client/src/OrcaPage", () => ({ default: () => <div>ORCA page</div> }));
vi.mock("../../client/src/KriPage", () => ({ default: () => <div>KRIs page</div> }));
vi.mock("../../client/src/notifications", () => ({
  NotificationsProvider: ({ children }: { children: unknown }) => children,
  NotificationBell: () => <button type="button" aria-label="Notifications" />,
  ImportanceToggle: () => null,
}));

import App from "../../client/src/App";

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
  displayName: "Risk Analyst",
  role: "User",
  status: "Active",
  allowedPages: ["dashboard", "orca"],
};

function renderApp(entry = "/") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <App />
    </MemoryRouter>,
  );
}

describe("SPA shell", () => {
  beforeEach(() => {
    authState.user = null;
    authState.loading = false;
    authState.signOut.mockReset();
  });

  it("shows a loading state then the login screen when signed out", async () => {
    authState.loading = true;
    const { rerender } = renderApp();
    expect(screen.getByText("Loading DaxGov…")).toBeInTheDocument();
    authState.loading = false;
    rerender(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "DaxGov" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("renders Admin navigation and client-side ORCA routing", async () => {
    authState.user = admin;
    renderApp("/orca");
    expect(await screen.findByText("ORCA page")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /user management/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(authState.signOut).toHaveBeenCalled();
  });

  it("hides admin-only nav from a User and redirects ungranted routes", async () => {
    authState.user = analyst;
    renderApp("/documents");
    await waitFor(() =>
      expect(screen.getByText("Executive Dashboard")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("link", { name: /user management/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /governance documents/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /orca/i })).toBeInTheDocument();
  });

  it("describes Aurora on Settings when file backups are off", async () => {
    authState.user = admin;
    renderApp("/settings");
    expect(
      await screen.findByText(/DaxGov is using Aurora Serverless/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/single-page application/i),
    ).toBeInTheDocument();
  });
});
