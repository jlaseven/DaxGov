import { render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "../../client/src/LoginPage";
import { AuthProvider } from "../../client/src/auth";
import { ApiError } from "../../client/src/api";

vi.mock("../../client/src/api", async () => {
  const actual = await vi.importActual<typeof import("../../client/src/api")>(
    "../../client/src/api",
  );
  return {
    ...actual,
    api: vi.fn(),
  };
});

import { api } from "../../client/src/api";

const apiMock = vi.mocked(api);

function renderLogin() {
  return render(
    <AuthProvider>
      <LoginPage />
    </AuthProvider>,
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    apiMock.mockReset();
    window.history.replaceState({}, "", "/");
  });

  it("signs in through the API with the typed credentials", async () => {
    apiMock.mockImplementation(async (path) => {
      if (path === "/me") throw new ApiError("Authentication required", 401);
      if (path === "/auth/sso")
        return { data: { jumpcloud: false, passwordLogin: true } };
      if (path === "/login") return { data: { username: "admin" } };
      throw new Error(String(path));
    });
    renderLogin();
    await screen.findByRole("heading", { name: "DaxGov" });
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "AdminPass-12x" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/login",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            username: "admin",
            password: "AdminPass-12x",
          }),
        }),
      ),
    );
  });

  it("shows a generic password error and the JumpCloud button when SSO is on", async () => {
    apiMock.mockImplementation(async (path) => {
      if (path === "/me") throw new ApiError("Authentication required", 401);
      if (path === "/auth/sso")
        return { data: { jumpcloud: true, passwordLogin: true } };
      if (path === "/login")
        throw new ApiError("Invalid username or password.", 401);
      throw new Error(String(path));
    });
    renderLogin();
    expect(
      await screen.findByRole("link", { name: "Sign in with JumpCloud" }),
    ).toHaveAttribute("href", "/api/auth/jumpcloud");
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "nope" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid username or password.",
    );
  });

  it("surfaces JumpCloud errors from the URL", async () => {
    window.history.replaceState({}, "", "/?sso_error=not_provisioned");
    apiMock.mockImplementation(async (path) => {
      if (path === "/me") throw new ApiError("Authentication required", 401);
      if (path === "/auth/sso")
        return { data: { jumpcloud: true, passwordLogin: true } };
      throw new Error(String(path));
    });
    renderLogin();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your JumpCloud account is not provisioned in DaxGov",
    );
  });
});
