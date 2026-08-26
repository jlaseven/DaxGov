import { describe, expect, it } from "vitest";
import {
  buildDaxonInventoryCandidates,
  daxonControlsQuestionId,
  extractAssetNames,
  extractReadablePageText,
  extractWebSearchResults,
  informationAssetUpdateSchema,
  planInformationAssetSync,
  researchInformationAsset,
  resultsToBullets,
  sourceAssetKey,
  vulnerabilitySearchQueries,
} from "../server/informationAssets";
import {
  extractJsonObject,
  mergeLineLists,
  parseResearchModels,
  pdaxOrganizationContext,
  pickStrongerRating,
  publisherIdsFor,
} from "../server/modelGarden";

describe("Information Asset Inventory", () => {
  it("extracts named list items without splitting a single row on commas", () => {
    const responses = {
      "discovery.2.1":
        "• Customer records\n• Financial reports\n• Vendor contracts",
      "discovery.5.1":
        "• Salesforce\n• Google Workspace\n• Device Information (Qualys)",
      [daxonControlsQuestionId]:
        "• Multi-factor authentication\n• Quarterly access reviews",
    };
    expect(extractAssetNames(responses).map((item) => item.assetName)).toEqual([
      "Customer records",
      "Financial reports",
      "Vendor contracts",
      "Salesforce",
      "Google Workspace",
      "Device Information (Qualys)",
    ]);
  });

  it("does not invent extra assets from commas in a sentence", () => {
    const responses = {
      "discovery.2.1":
        "Email, Account, Device Information (Qualys), Google Workspace Credentials",
      "discovery.5.1": "Jumpcloud; Google Workspace",
    };
    expect(extractAssetNames(responses).map((item) => item.assetName)).toEqual([
      "Email, Account, Device Information (Qualys), Google Workspace Credentials",
      "Jumpcloud",
      "Google Workspace",
    ]);
  });

  it("keeps one current Daxon assessment per department and drops stale names", () => {
    const oldKey = sourceAssetKey("Account");
    const keepKey = sourceAssetKey("Google Workspace");
    const candidates = buildDaxonInventoryCandidates([
      {
        id: 1,
        department: "Cybersecurity",
        departmentKey: "cybersecurity",
        isActive: false,
        importedAt: "2026-08-01T00:00:00.000Z",
        questionnaireResponses: JSON.stringify({
          "discovery.2.1": "• Account\n• Device Information (Qualys)",
          "discovery.5.1": "• Jumpcloud",
        }),
      },
      {
        id: 2,
        department: "Cybersecurity",
        departmentKey: "cybersecurity",
        isActive: true,
        importedAt: "2026-08-26T00:00:00.000Z",
        questionnaireResponses: JSON.stringify({
          "discovery.2.1": "• Device Information (Qualys)",
          "discovery.5.1":
            "• Google Workspace\n• Device Information (Qualys)\n• JumpCloud",
        }),
      },
    ]);
    expect([...candidates.values()].map((item) => item.assetName).sort()).toEqual(
      ["Device Information (Qualys)", "Google Workspace", "JumpCloud"].sort(),
    );
    expect(
      planInformationAssetSync(
        [
          { id: 10, departmentKey: "cybersecurity", sourceAssetKey: oldKey },
          { id: 11, departmentKey: "cybersecurity", sourceAssetKey: keepKey },
          {
            id: 12,
            departmentKey: "cybersecurity",
            sourceAssetKey: sourceAssetKey("Device Information (Qualys)"),
          },
        ],
        candidates,
      ),
    ).toMatchObject({
      staleIds: [10],
      created: 1,
      updated: 2,
    });
  });

  it("creates a stable department asset source key", () => {
    expect(sourceAssetKey(" Salesforce ")).toBe(sourceAssetKey("salesforce"));
    expect(sourceAssetKey("Salesforce")).not.toBe(sourceAssetKey("Jira"));
  });

  it("parses public search snippets and limits research to five bullets", () => {
    const html = Array.from(
      { length: 7 },
      (_, index) => `
        <div class="result results_links">
          <a class="result__a" href="https://example.com/${index}">Result ${index}</a>
          <a class="result__snippet">Security finding number ${index} for the asset.</a>
        </div>`,
    ).join("");
    const results = extractWebSearchResults(html);
    expect(results).toHaveLength(7);
    expect(results[0]).toMatchObject({
      title: "Result 0",
      url: "https://example.com/0",
      snippet: "Security finding number 0 for the asset.",
    });
    expect(resultsToBullets(results).split("\n")).toHaveLength(5);
  });

  it("accepts editable blank inventory fields", () => {
    expect(
      informationAssetUpdateSchema.safeParse({
        assetName: "Customer records",
        assetType: null,
        businessImpact: null,
        threat: null,
        vulnerability: null,
        likelihood: null,
        impact: null,
        riskLevel: null,
        existingControls: "MFA",
      }).success,
    ).toBe(true);
  });

  it("defaults research to both Kimi K2 and GLM", () => {
    expect(parseResearchModels(undefined)).toBe("both");
    expect(publisherIdsFor("both")).toEqual(["kimi", "glm"]);
  });

  it("extracts JSON from Model Garden thinking text", () => {
    const parsed = extractJsonObject(`
      <think>planning</think>
      \`\`\`json
      {"businessImpact":["Outage stops settlements"],"threat":["Credential stuffing"]}
      \`\`\`
    `);
    expect(parsed.businessImpact).toEqual(["Outage stops settlements"]);
  });

  it("interleaves Kimi and GLM bullets and keeps the stronger rating", () => {
    expect(
      mergeLineLists(
        [
          ["Kimi impact A", "Kimi impact B"],
          ["GLM impact A", "Kimi impact B"],
        ],
        3,
      ),
    ).toEqual(["Kimi impact A", "GLM impact A", "Kimi impact B"]);
    expect(pickStrongerRating(["Medium", "High"])).toBe("High");
  });

  it("merges Kimi K2 and GLM research when both models respond", async () => {
    const research = await researchInformationAsset("Salesforce", "SaaS", {
      models: "both",
      search: async () => [
        {
          title: "Salesforce security",
          url: "https://example.com/salesforce",
          snippet: "Public CRM tenant data is a high-value target.",
        },
      ],
      scrape: async () => [],
      completeChat: async ({ modelId }) =>
        JSON.stringify({
          businessImpact:
            modelId === "kimi"
              ? ["Customer data unavailable during outage"]
              : ["Regulatory reporting delayed"],
          threat:
            modelId === "kimi"
              ? ["Credential stuffing against SSO"]
              : ["OAuth token theft"],
          vulnerability: ["Over-privileged connected apps"],
          likelihood: modelId === "kimi" ? "Medium" : "High",
          impact: "High",
          riskLevel: "High",
        }),
    });
    expect(research.businessImpact).toContain(
      "• Customer data unavailable during outage",
    );
    expect(research.businessImpact).toContain("• Regulatory reporting delayed");
    expect(research.threat).toContain("• Credential stuffing against SSO");
    expect(research.threat).toContain("• OAuth token theft");
    expect(research.likelihood).toBe("High");
    expect(JSON.parse(String(research.researchSources)).models).toEqual([
      "kimi",
      "glm",
    ]);
  });

  it("continues with GLM when Kimi K2 fails", async () => {
    const research = await researchInformationAsset("JumpCloud", null, {
      models: "both",
      search: async () => [],
      scrape: async () => [],
      completeChat: async ({ modelId }) => {
        if (modelId === "kimi") throw new Error("Kimi quota exceeded");
        return JSON.stringify({
          businessImpact: ["Identity outage blocks staff access"],
          threat: ["Admin takeover"],
          vulnerability: ["Shared break-glass accounts"],
          likelihood: "Medium",
          impact: "High",
          riskLevel: "High",
        });
      },
    });
    expect(research.businessImpact).toBe("• Identity outage blocks staff access");
    expect(JSON.parse(String(research.researchSources)).models).toEqual([
      "glm",
    ]);
  });

  it("strips scripts and keeps readable page text for scraping", () => {
    expect(
      extractReadablePageText(
        "<html><script>alert(1)</script><p>Hot wallet keys leaked from memory.</p></html>",
      ),
    ).toBe("Hot wallet keys leaked from memory.");
  });

  it("searches vulnerabilities first, then asks models to refine them for PDAX", async () => {
    const queries: string[] = [];
    let prompt = "";
    await researchInformationAsset("Hot wallet", "Crypto custody", {
      models: "kimi",
      search: async (query) => {
        queries.push(query);
        return [
          {
            title: "Wallet drain",
            url: "https://example.com/vuln",
            snippet: "Private keys can be extracted from poorly isolated hot wallets.",
          },
        ];
      },
      scrape: async () => [
        {
          title: "Wallet drain",
          url: "https://example.com/vuln",
          text: "Hot wallet key extraction via memory dump is a common exchange failure.",
        },
      ],
      completeChat: async ({ prompt: nextPrompt }) => {
        prompt = nextPrompt;
        return JSON.stringify({
          businessImpact: ["Customer crypto cannot be withdrawn"],
          threat: ["Hot wallet drain"],
          vulnerability: ["Unisolated hot-wallet signing keys"],
          likelihood: "High",
          impact: "Critical",
          riskLevel: "Critical",
        });
      },
    });
    expect(queries[0]).toMatch(/vulnerability/i);
    expect(queries.slice(0, 2)).toEqual(
      vulnerabilitySearchQueries("Hot wallet Crypto custody"),
    );
    expect(pdaxOrganizationContext).toMatch(/PDAX/);
    expect(prompt).toMatch(/PDAX/);
    expect(prompt).toMatch(/Initial vulnerability research/i);
    expect(prompt).toMatch(/Hot wallet key extraction via memory dump/);
    expect(prompt).toMatch(/Philippines/);
  });
});
