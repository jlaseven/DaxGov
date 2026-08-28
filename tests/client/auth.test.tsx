import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "../../client/src/auth";
import { ApiError } from "../../client/src/api";

vi.mock("../../client/src/api", async () => {
  const actual = await vi.importActual<typeof import("../../client/src/api")>(
    "../../client/src/api",
  );
  return { ...actual, api: vi.fn() };
});

import { api } from "../../client/src/api";

const apiMock = vi.mocked(api);

function Probe() {
  const { user, loading } = useAuth();
  if (loading) return <p>loading</p>;
  if (!user) return <p>signed out</p>;
  return <p>{user.displayName}</p>;
}

describe("AuthProvider", () => {
  beforeEach(() => {
    apiMock.mockReset();
  });

  it("loads the current user from /api/me", async () => {
    apiMock.mockResolvedValue({
      data: {
        id: 1,
        username: "admin",
        displayName: "Administrator",
        role: "Admin",
        status: "Active",
        allowedPages: ["dashboard"],
      },
    });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByText("loading")).toBeInTheDocument();
    expect(await screen.findByText("Administrator")).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith("/me");
  });

  it("treats an unauthenticated /me response as signed out", async () => {
    apiMock.mockRejectedValue(new ApiError("Authentication required", 401));
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText("signed out")).toBeInTheDocument(),
    );
  });
});
