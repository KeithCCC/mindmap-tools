import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import vercelConfig from "../vercel.json";
import { createGenerateMindmapHandler } from "../api/ai/generate-mindmap";
import { AiMindmapError } from "../shared/aiMindmap";

function createResponse() {
  const response = {
    statusCode: 200,
    headers: new Map<string, string>(),
    body: undefined as unknown,
    setHeader: vi.fn((name: string, value: string) => {
      response.headers.set(name, value);
      return response;
    }),
    status: vi.fn((statusCode: number) => {
      response.statusCode = statusCode;
      return response;
    }),
    json: vi.fn((body: unknown) => {
      response.body = body;
      return response;
    }),
  };
  return response;
}

describe("Vercel AI mindmap function", () => {
  it("uses Node ESM-compatible relative imports in the deployed module chain", () => {
    const deployedSources = [
      readFileSync(resolve(process.cwd(), "api/ai/generate-mindmap.ts"), "utf8"),
      readFileSync(resolve(process.cwd(), "server/openaiMindmap.ts"), "utf8"),
    ];

    for (const source of deployedSources) {
      const relativeImports = [...source.matchAll(/from\s+"(\.\.?\/[^"]+)"/g)].map((match) => match[1]);
      expect(relativeImports.length).toBeGreaterThan(0);
      expect(relativeImports.every((specifier) => specifier.endsWith(".js"))).toBe(true);
    }
  });

  it("configures the function duration in vercel.json", () => {
    expect(vercelConfig.functions["api/ai/generate-mindmap.ts"]).toEqual({ maxDuration: 150 });
  });

  it("returns a generated mindmap for POST requests", async () => {
    const mindmap = { title: "Plan", body: null, children: [] };
    const generate = vi.fn().mockResolvedValue(mindmap);
    const response = createResponse();

    await createGenerateMindmapHandler(generate)(
      { method: "POST", body: { theme: " Plan ", instructions: " Risks " } },
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ mindmap });
    expect(generate).toHaveBeenCalledWith({ theme: "Plan", instructions: "Risks" });
  });

  it.each(["GET", "PUT", "OPTIONS"])("rejects %s requests", async (method) => {
    const generate = vi.fn();
    const response = createResponse();

    await createGenerateMindmapHandler(generate)({ method, body: undefined }, response);

    expect(response.statusCode).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
    expect(response.body).toEqual({ error: "Method not allowed.", code: "method_not_allowed" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects an empty theme without calling OpenAI", async () => {
    const generate = vi.fn();
    const response = createResponse();

    await createGenerateMindmapHandler(generate)({ method: "POST", body: { theme: " " } }, response);

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: "Theme is required.", code: "theme_required" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns sanitized known errors", async () => {
    const generate = vi.fn().mockRejectedValue(new AiMindmapError("OpenAI is not configured.", 503, "openai_not_configured"));
    const response = createResponse();

    await createGenerateMindmapHandler(generate)({ method: "POST", body: { theme: "Plan" } }, response);

    expect(response.statusCode).toBe(503);
    expect(response.body).toEqual({ error: "OpenAI is not configured.", code: "openai_not_configured" });
  });

  it("does not expose unknown error details", async () => {
    const generate = vi.fn().mockRejectedValue(new Error("secret upstream detail"));
    const response = createResponse();

    await createGenerateMindmapHandler(generate)({ method: "POST", body: { theme: "Plan" } }, response);

    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({ error: "Mindmap generation failed.", code: "generation_failed" });
    expect(JSON.stringify(response.body)).not.toContain("secret upstream detail");
  });
});
