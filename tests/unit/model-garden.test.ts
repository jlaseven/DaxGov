import {
  parseResearchModels,
  publisherIdsFor,
  researchModelLabel,
  modelGardenCredentialsJson,
} from "../../server/modelGarden";
import { afterEach, describe, expect, it } from "vitest";

describe("Model Garden research models", () => {
  it("accepts kimi, glm, or both", () => {
    expect(parseResearchModels("kimi")).toBe("kimi");
    expect(parseResearchModels("GLM")).toBe("glm");
    expect(parseResearchModels(undefined)).toBe("both");
    expect(publisherIdsFor("both")).toEqual(["glm", "kimi"]);
    expect(publisherIdsFor("kimi")).toEqual(["kimi"]);
    expect(researchModelLabel("both")).toBe("GLM + Kimi K2");
  });

  it("rejects unknown model ids", () => {
    expect(() => parseResearchModels("gpt")).toThrow(/kimi, glm, or both/);
  });

  it("reads Model Garden credentials from Secrets Manager JSON", () => {
    const previous = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    try {
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
      expect(modelGardenCredentialsJson()).toBe("");
      process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = ' {"type":"service_account"} ';
      expect(modelGardenCredentialsJson()).toBe('{"type":"service_account"}');
    } finally {
      if (previous === undefined)
        delete process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
      else process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = previous;
    }
  });
});
