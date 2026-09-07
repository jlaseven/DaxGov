import { describe, expect, it } from "vitest";
import {
  SESSION_ABSOLUTE_TTL_MS,
  SESSION_TTL_MS,
  nextSessionExpiry,
  sessionExpired,
} from "../../server/auth";

describe("session lifetime", () => {
  it("expires idle sessions and sessions past the absolute sign-in window", () => {
    const now = new Date("2026-09-07T08:00:00.000Z");
    expect(
      sessionExpired(
        {
          createdAt: now,
          expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
        },
        now,
      ),
    ).toBe(false);
    expect(
      sessionExpired(
        {
          createdAt: now,
          expiresAt: new Date(now.getTime() - 1),
        },
        now,
      ),
    ).toBe(true);
    expect(
      sessionExpired(
        {
          createdAt: new Date(now.getTime() - SESSION_ABSOLUTE_TTL_MS),
          expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
        },
        now,
      ),
    ).toBe(true);
  });

  it("does not slide a session past the absolute timeout", () => {
    const createdAt = new Date("2026-09-07T00:00:00.000Z");
    const nearEnd = new Date(createdAt.getTime() + SESSION_ABSOLUTE_TTL_MS - 5 * 60 * 1000);
    expect(nextSessionExpiry(createdAt, nearEnd).getTime()).toBe(
      createdAt.getTime() + SESSION_ABSOLUTE_TTL_MS,
    );
    expect(nextSessionExpiry(createdAt, createdAt).getTime()).toBe(
      createdAt.getTime() + SESSION_TTL_MS,
    );
  });
});
