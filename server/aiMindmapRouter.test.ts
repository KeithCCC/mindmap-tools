import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { AiMindmapError } from "../shared/aiMindmap";
import { createAiMindmapRouter, type GenerateMindmapFunction } from "./aiMindmapRouter";

function createTestApp(generate: GenerateMindmapFunction) {
  const app = express();
  app.use(express.json());
  app.use(createAiMindmapRouter({ generate }));
  return app;
}

describe("POST /api/ai/generate-mindmap", () => {
  it("rejects an empty theme without calling OpenAI", async () => {
    const generate = vi.fn();

    const response = await request(createTestApp(generate)).post("/api/ai/generate-mindmap").send({ theme: " " });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Theme is required.", code: "theme_required" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns a generated mindmap", async () => {
    const mindmap = { title: "Plan", body: null, children: [] };
    const generate = vi.fn().mockResolvedValue(mindmap);

    const response = await request(createTestApp(generate))
      .post("/api/ai/generate-mindmap")
      .send({ theme: " Plan ", instructions: " Milestones " });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ mindmap });
    expect(generate).toHaveBeenCalledWith({ theme: "Plan", instructions: "Milestones" });
  });

  it("returns sanitized known and unknown errors", async () => {
    const known = vi.fn().mockRejectedValue(new AiMindmapError("OpenAI request failed.", 502, "openai_upstream_error"));
    const unknown = vi.fn().mockRejectedValue(new Error("secret upstream detail"));

    const knownResponse = await request(createTestApp(known)).post("/api/ai/generate-mindmap").send({ theme: "Plan" });
    const unknownResponse = await request(createTestApp(unknown)).post("/api/ai/generate-mindmap").send({ theme: "Plan" });

    expect(knownResponse.body).toEqual({ error: "OpenAI request failed.", code: "openai_upstream_error" });
    expect(unknownResponse.status).toBe(500);
    expect(unknownResponse.body).toEqual({ error: "Mindmap generation failed.", code: "generation_failed" });
    expect(JSON.stringify(unknownResponse.body)).not.toContain("secret upstream detail");
  });
});
