import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, csv, setOnAuthRequired } from "../../client/src/api";

describe("frontend API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setOnAuthRequired(null);
  });

  it("sends credentials and the DaxGov mutating header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { ok: true } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(api("/documents")).resolves.toEqual({ data: { ok: true } });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/documents",
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Requested-With": "DaxGov",
        }),
      }),
    );
  });

  it("turns field errors and 401s into ApiError and notifies auth", async () => {
    const onAuth = vi.fn();
    setOnAuthRequired(onAuth);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "Authentication required" }),
      }),
    );
    await expect(api("/me")).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
      message: "Authentication required",
    });
    expect(onAuth).toHaveBeenCalled();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: "Validation failed",
          details: { fieldErrors: { documentName: ["Required"] } },
        }),
      }),
    );
    await expect(api("/documents", { method: "POST" })).rejects.toBeInstanceOf(
      ApiError,
    );
    await expect(api("/documents", { method: "POST" })).rejects.toMatchObject({
      message: "Required",
      status: 400,
    });
  });

  it("neutralizes CSV formula injection in downloaded rows", () => {
    const clicks: string[] = [];
    const original = URL.createObjectURL;
    URL.createObjectURL = vi.fn(() => "blob:csv") as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicks.push(this.download);
      });
    csv([{ name: "=CMD()", note: "ok" }], "export", [
      { key: "name", header: "Name" },
      { key: "note", header: "Note" },
    ]);
    expect(clicks).toEqual(["export.csv"]);
    click.mockRestore();
    URL.createObjectURL = original;
  });
});
