import { afterEach, describe, expect, it } from "vitest";
import {
  assetResearchEnabled,
  isHostedRuntime,
  runtimeName,
} from "../../server/features";

describe("feature flags", () => {
  const previous = {
    ASSET_RESEARCH_DISABLED: process.env.ASSET_RESEARCH_DISABLED,
    NODE_ENV: process.env.NODE_ENV,
  };

  afterEach(() => {
    restore("ASSET_RESEARCH_DISABLED", previous.ASSET_RESEARCH_DISABLED);
    restore("NODE_ENV", previous.NODE_ENV);
  });

  it("enables asset research unless explicitly disabled", () => {
    delete process.env.ASSET_RESEARCH_DISABLED;
    expect(assetResearchEnabled()).toBe(true);
    process.env.ASSET_RESEARCH_DISABLED = "true";
    expect(assetResearchEnabled()).toBe(false);
    process.env.ASSET_RESEARCH_DISABLED = "1";
    expect(assetResearchEnabled()).toBe(false);
    process.env.ASSET_RESEARCH_DISABLED = "false";
    expect(assetResearchEnabled()).toBe(true);
  });

  it("treats sandbox as a hosted runtime like production", () => {
    expect(runtimeName("sandbox")).toBe("sandbox");
    expect(isHostedRuntime("sandbox")).toBe(true);
    expect(isHostedRuntime("production")).toBe(true);
    expect(isHostedRuntime("development")).toBe(false);
    expect(isHostedRuntime("test")).toBe(false);
  });
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
