export function runtimeName(raw = process.env.NODE_ENV) {
  return String(raw || "development").trim().toLowerCase() || "development";
}

export function isHostedRuntime(raw = process.env.NODE_ENV) {
  const value = runtimeName(raw);
  return value !== "development" && value !== "test";
}

export function assetResearchEnabled() {
  const raw = String(process.env.ASSET_RESEARCH_DISABLED || "").toLowerCase();
  return raw !== "1" && raw !== "true";
}
