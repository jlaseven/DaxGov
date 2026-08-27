import { describe, expect, it } from "vitest";
import {
  buildDaxonInventoryCandidates,
  daxonControlsQuestionId,
  extractAssetNames,
  extractReadablePageText,
  extractWebSearchResults,
  formatDaxonResearchContext,
  formatOrcaResearchContext,
  informationAssetUpdateSchema,
  planInformationAssetSync,
  researchInformationAsset,
  resultsToBullets,
  sourceAssetKey,
  vulnerabilitySearchQueries,
} from "../server/informationAssets";
import {
  clipAtBoundary,
  completeFinding,
  draftFromModelJson,
  enrichVulnerabilityLines,
  extractCvesFromText,
  extractJsonObject,
  isIncompleteFinding,
  isPlaceholderFinding,
  mapVulnerabilityToOwasp,
  mergeLineLists,
  parseResearchModels,
  pdaxOrganizationContext,
  pickStrongerRating,
  publisherIdsFor,
  sanitizeInventoryField,
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

  it("splits a systems comma list into separate inventory assets", () => {
    const responses = {
      "discovery.2.1":
        "Device Information (Qualys, Mobile Device Information)",
      "discovery.5.1":
        "Jumpcloud, Google Workspace, Slack, Qualys, TrendMicro, Kissflow, NordPass",
    };
    expect(extractAssetNames(responses).map((item) => item.assetName)).toEqual([
      "Device Information (Qualys, Mobile Device Information)",
      "Jumpcloud",
      "Google Workspace",
      "Slack",
      "Qualys",
      "TrendMicro",
      "Kissflow",
      "NordPass",
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

  it("parses public search snippets and limits research to three bullets", () => {
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
    expect(resultsToBullets(results).split("\n")).toHaveLength(3);
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
    expect(publisherIdsFor("both")).toEqual(["glm", "kimi"]);
  });

  it("extracts JSON from Model Garden thinking text", () => {
    const parsed = extractJsonObject(`
      <think>planning</think>
      \`\`\`json
      {"businessImpact":["Outage stops settlements"],"threat":["Credential stuffing"]}
      \`\`\`
    `);
    expect(parsed.businessImpact).toEqual(["Outage stops settlements"]);
    expect(
      extractJsonObject('{"businessImpact":["Outage stops settlements"],}'),
    ).toMatchObject({ businessImpact: ["Outage stops settlements"] });
    expect(
      extractJsonObject(`
        <think>still thinking about the asset
        {"noise":true}
        {"businessImpact":["Identity outage blocks staff"],"threat":["Admin takeover"]}
      `),
    ).toMatchObject({
      businessImpact: ["Identity outage blocks staff"],
      threat: ["Admin takeover"],
    });
    expect(isPlaceholderFinding("up to 5 short bullets")).toBe(true);
    expect(isPlaceholderFinding("bullet 1")).toBe(true);
    expect(completeFinding("bullet 1")).toBe("");
    expect(
      completeFinding(
        "bullet 1: Successful device takeover attacks can lead to severe data breaches, financial losses, and a complete erosion of customer trust in digital payment platforms.",
      ),
    ).toBe(
      "Successful device takeover attacks can lead to severe data breaches, financial losses, and a complete erosion of customer trust in digital payment platforms.",
    );
    expect(
      draftFromModelJson({
        businessImpact: [
          "Financial institutions face significant regulatory and operational risks if they fail to comply with the Bangko Sentral ng Pilipinas Circular No. 1213, which mandates stricter authentication protocols.",
          "bullet 1",
          "Successful device takeover attacks can lead to severe data breaches, financial losses, and a complete erosion of customer trust in digital payment platforms.",
        ],
        threat: ["Admin takeover"],
        vulnerability: ["Shared break-glass accounts"],
      }).businessImpact,
    ).toEqual([
      "Financial institutions face significant regulatory and operational risks if they fail to comply with the Bangko Sentral ng Pilipinas Circular No. 1213, which mandates stricter authentication protocols.",
      "Successful device takeover attacks can lead to severe data breaches, financial losses, and a complete erosion of customer trust in digital payment platforms.",
    ]);
    expect(
      isIncompleteFinding(
        "Unauthorized disclosure of the Contract of Application owned by the department could expose vendor trade secrets and BSP compliance agree…",
      ),
    ).toBe(true);
    expect(
      completeFinding(
        "Unauthorized disclosure of the Contract of Application owned by the department could expose vendor trade secrets and BSP compliance agree…",
      ),
    ).toBe("");
    expect(
      completeFinding(
        "Unauthorized disclosure of the Contract of Application owned by the department could expose vendor trade secrets and BSP compliance agreements with third parties.",
      ),
    ).toBe(
      "Unauthorized disclosure of the Contract of Application owned by the department could expose vendor trade secrets and BSP compliance agreements with third parties.",
    );
    expect(
      clipAtBoundary(
        "Unauthorized disclosure of the contract. This second sentence should not be required because it is extra detail.",
        50,
      ),
    ).toBe("Unauthorized disclosure of the contract.");
    expect(
      sanitizeInventoryField(
        "• Unauthorized disclosure of the Contract of Application owned by the department could expose vendor trade secrets and BSP compliance agree…\n• Loss or tampering of this contract may disrupt vendor management and compliance audits.",
      ),
    ).toBe(
      "• Loss or tampering of this contract may disrupt vendor management and compliance audits.",
    );
    expect(
      draftFromModelJson({
        businessImpact: ["up to 5 short bullets"],
        threat: ["up to 5 short bullets"],
        vulnerability: ["up to 5 short bullets"],
        likelihood: "Low | Medium | High",
      }),
    ).toMatchObject({
      businessImpact: [],
      threat: [],
      vulnerability: [],
      likelihood: null,
    });
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
    expect(
      mapVulnerabilityToOwasp("Shared JumpCloud break-glass accounts without MFA"),
    ).toBe("A07:2025 Authentication Failures");
    expect(
      extractCvesFromText(
        "JumpCloud Remote Assist CVE-2025-34352 has CVSS 8.8 on Linux agents.",
      ),
    ).toEqual([
      { id: "CVE-2025-34352", cvss: 8.8, rating: "High" },
    ]);
    expect(
      enrichVulnerabilityLines(
        ["Unpatched JumpCloud Remote Assist agents on admin laptops"],
        [{ id: "CVE-2025-34352", cvss: 8.8, rating: "High" }],
      )[0],
    ).toMatch(
      /Unpatched JumpCloud Remote Assist agents on admin laptops \(A03:2025 Software Supply Chain Failures; CVE-2025-34352 CVSS 8\.8 High\)/,
    );
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
      "glm",
      "kimi",
    ]);
  });

  it("continues with GLM when Kimi K2 fails", async () => {
    const research = await researchInformationAsset("JumpCloud", null, {
      models: "both",
      retryDelayMs: 0,
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
    const research = await researchInformationAsset("Hot wallet", "Crypto custody", {
      models: "kimi",
      search: async (query) => {
        queries.push(query);
        return [
          {
            title: "Wallet drain",
            url: "https://example.com/vuln",
            snippet:
              "Private keys can be extracted from poorly isolated hot wallets. CVE-2024-12345 CVSS 9.1.",
          },
        ];
      },
      scrape: async () => [
        {
          title: "Wallet drain",
          url: "https://example.com/vuln",
          text: "Hot wallet key extraction via memory dump is a common exchange failure. CVE-2024-12345 CVSS 9.1.",
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
    expect(prompt).toMatch(/CVE-2024-12345 CVSS 9.1 Critical/);
    expect(research.vulnerability).toMatch(/A0\d:2025/);
    expect(research.vulnerability).toMatch(
      /CVE-2024-12345 CVSS 9\.1 Critical/,
    );
  });

  it("retries GLM when the first replies are not JSON", async () => {
    let glmCalls = 0;
    const prompts: string[] = [];
    const research = await researchInformationAsset("Qualys", "Scanner", {
      models: "both",
      retryDelayMs: 0,
      daxonContext: "Cybersecurity: Qualys is used for device scanning.",
      orcaContext: "CYB-1-1 · VAPT: delayed pentest leaves hosts exposed.",
      search: async () => [],
      scrape: async () => [],
      completeChat: async ({ modelId, prompt }) => {
        prompts.push(prompt);
        if (modelId === "kimi") {
          return JSON.stringify({
            businessImpact: ["Scan outage hides host weaknesses"],
            threat: ["Attackers exploit unscanned systems"],
            vulnerability: ["Stale scanner credentials"],
            likelihood: "Medium",
            impact: "High",
            riskLevel: "High",
          });
        }
        glmCalls += 1;
        if (glmCalls < 2) return "thinking about Qualys with no json";
        return JSON.stringify({
          businessImpact: ["Delayed patching of exchange hosts"],
          threat: ["Unpatched assets stay reachable"],
          vulnerability: ["Qualys agents missing on jump hosts"],
          likelihood: "High",
          impact: "High",
          riskLevel: "High",
        });
      },
    });
    expect(glmCalls).toBe(2);
    expect(research.businessImpact).toContain(
      "• Delayed patching of exchange hosts",
    );
    expect(JSON.parse(String(research.researchSources))).toMatchObject({
      models: ["glm", "kimi"],
      daxon: true,
      orca: true,
    });
    expect(prompts.some((prompt) => prompt.includes("unusable"))).toBe(
      true,
    );
    expect(prompts[0]).toMatch(/Qualys is used for device scanning/);
    expect(prompts[0]).toMatch(/delayed pentest leaves hosts exposed/);
  });

  it("keeps Kimi findings after GLM JSON retries fail", async () => {
    let glmCalls = 0;
    const research = await researchInformationAsset("Slack", null, {
      models: "both",
      retryDelayMs: 0,
      search: async () => [],
      scrape: async () => [],
      completeChat: async ({ modelId }) => {
        if (modelId === "glm") {
          glmCalls += 1;
          return "still not json";
        }
        return JSON.stringify({
          businessImpact: ["Incident chat is unavailable during an attack"],
          threat: ["Token theft from a workspace app"],
          vulnerability: ["Guest accounts retained after offboarding"],
          likelihood: "Medium",
          impact: "High",
          riskLevel: "High",
        });
      },
    });
    expect(glmCalls).toBe(2);
    expect(research.businessImpact).toBe(
      "• Incident chat is unavailable during an attack",
    );
    expect(JSON.parse(String(research.researchSources)).models).toEqual([
      "kimi",
    ]);
  });

  it("pulls matching Daxon answers and skips placeholder text", () => {
    const context = formatDaxonResearchContext(
      "Jumpcloud",
      [
        {
          department: "Cybersecurity",
          departmentKey: "cybersecurity",
          isActive: true,
          respondentName: "Julius Faa",
          questionnaireResponses: JSON.stringify({
            "discovery.1.1":
              "UEM (Jumpcloud Management)\nAsset Management (Hardware and Software)",
            "discovery.5.2":
              "Jumpcloud - Julius Faa (Owner); Admin - Julius Faa, Jayson Erasga",
            "discovery.8.1": "THIS IS WHERE WE STOPPED",
          }),
        },
      ],
      "cybersecurity",
    );
    expect(context).toMatch(/Jumpcloud Management/);
    expect(context).toMatch(/Julius Faa/);
    expect(context).toMatch(/source department/);
    expect(context).not.toMatch(/THIS IS WHERE WE STOPPED/);
  });

  it("matches ORCA VAPT risks to Qualys and ignores unrelated rows", () => {
    const context = formatOrcaResearchContext("Qualys", "", [
      {
        riskNo: "CYB-1-1",
        process: "Vulnerability Assessment and Penetration Testing",
        riskThreat:
          "Delayed pentest engagement may result in prolonged exposure.",
        cause: "Lack of manpower",
        impactPerRisk: "Unidentified vulnerabilities may remain exposed",
        inherentLikelihood: "5 - Frequent",
        inherentImpactRating: "3 - Moderate",
        inherentRiskScore: 15,
      },
      {
        riskNo: "FIN-9-1",
        process: "Payroll",
        riskThreat: "Payroll files are processed late",
        inherentRiskScore: 4,
      },
    ]);
    expect(context).toMatch(/CYB-1-1/);
    expect(context).toMatch(/prolonged exposure/);
    expect(context).not.toMatch(/Payroll/);
  });

  it("rejects schema placeholders and retries until real findings arrive", async () => {
    let glmCalls = 0;
    const research = await researchInformationAsset("NordPass", "Password vault", {
      models: "glm",
      retryDelayMs: 0,
      daxonContext: "Cybersecurity uses NordPass for credential vaulting.",
      search: async () => [],
      scrape: async () => [],
      completeChat: async () => {
        glmCalls += 1;
        if (glmCalls === 1)
          return JSON.stringify({
            businessImpact: ["up to 5 short bullets"],
            threat: ["up to 5 short bullets"],
            vulnerability: ["up to 5 short bullets"],
            likelihood: "Low | Medium | High",
            impact: "Low | Medium | High",
            riskLevel: "Low | Medium | High | Critical",
          });
        return JSON.stringify({
          businessImpact: [
            "Stolen NordPass vaults expose staff and vendor passwords",
          ],
          threat: ["Phishing against the shared vault master password"],
          vulnerability: ["Shared NordPass collections without owner review"],
          likelihood: "Medium",
          impact: "High",
          riskLevel: "High",
        });
      },
    });
    expect(glmCalls).toBe(2);
    expect(research.businessImpact).toContain(
      "• Stolen NordPass vaults expose staff and vendor passwords",
    );
    expect(research.businessImpact).not.toMatch(/up to 5 short bullets/i);
  });

  it("has Kimi check a GLM draft when public scraping is unavailable", async () => {
    const prompts: string[] = [];
    const research = await researchInformationAsset("JumpCloud", "IAM", {
      models: "both",
      retryDelayMs: 0,
      daxonContext: "UEM (Jumpcloud Management) is a critical process.",
      orcaContext: "CYB-3 User Management: delayed joiner-leaver access changes.",
      search: async () => [],
      scrape: async () => [],
      completeChat: async ({ modelId, prompt }) => {
        prompts.push(prompt);
        const findings =
          modelId === "glm"
            ? {
                businessImpact: ["JumpCloud outage blocks laptop logins"],
                threat: ["Stolen JumpCloud admin API keys"],
                vulnerability: ["Shared JumpCloud break-glass accounts"],
                likelihood: "High",
                impact: "High",
                riskLevel: "High",
              }
            : {
                businessImpact: [
                  "Checked: identity outage stops trading-floor access",
                ],
                threat: ["Checked: MFA-bypass on unmanaged devices"],
                vulnerability: ["Checked: stale JumpCloud device groups"],
                likelihood: "High",
                impact: "High",
                riskLevel: "Critical",
              };
        return JSON.stringify(findings);
      },
    });
    expect(prompts.some((prompt) => /checking a GLM/i.test(prompt))).toBe(true);
    expect(research.businessImpact).toContain(
      "• Checked: identity outage stops trading-floor access",
    );
    expect(JSON.parse(String(research.researchSources)).peerReview).toBe(true);
  });

  it("finishes from Daxon and ORCA when both models fail to return JSON", async () => {
    const research = await researchInformationAsset("Qualys", "Scanner", {
      models: "both",
      retryDelayMs: 0,
      jsonAttempts: 1,
      daxonContext: "Cybersecurity uses Qualys to scan laptops and servers.",
      orcaContext:
        "CYB-1-1 delayed pentest leaves unidentified vulnerabilities exposed.",
      search: async () => [
        {
          title: "Qualys CVE",
          url: "https://example.com/cve",
          snippet: "Qualys agent issue CVE-2025-34352 CVSS 8.8.",
        },
      ],
      scrape: async () => [],
      completeChat: async () => "thinking with no json at all",
    });
    expect(research.businessImpact).toMatch(/Qualys/i);
    expect(research.vulnerability).toMatch(/A0\d:2025/);
    expect(JSON.parse(String(research.researchSources))).toMatchObject({
      fallback: true,
      daxon: true,
      orca: true,
    });
  });
});
