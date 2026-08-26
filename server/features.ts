export function assetResearchEnabled() {
  const raw = String(process.env.ASSET_RESEARCH_DISABLED || "").toLowerCase();
  return raw !== "1" && raw !== "true";
}
