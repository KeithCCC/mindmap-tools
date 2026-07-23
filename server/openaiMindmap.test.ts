import { describe, expect, it, vi } from "vitest";
import { AiMindmapError } from "../shared/aiMindmap";
import {
  buildOpenAIRequest,
  generateMindmap,
  OpenAIMindmapGateway,
  type MindmapModelGateway,
} from "./openaiMindmap";

const input = { theme: "New business", instructions: "Include risks" };

describe("OpenAI mindmap generation", () => {
  it("builds a strict Structured Outputs request", () => {
    expect(buildOpenAIRequest(input)).toMatchObject({
      model: "gpt-5.6-sol",
      max_output_tokens: 6000,
      text: {
        format: {
          type: "json_schema",
          name: "mindmap",
          strict: true,
          schema: expect.objectContaining({ type: "object", additionalProperties: false }),
        },
      },
    });
  });

  it("fails safely when the API key is missing", () => {
    let thrown: unknown;
    try {
      new OpenAIMindmapGateway("");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AiMindmapError);
    expect(thrown).toMatchObject({ status: 503, code: "openai_not_configured" });
  });

  it("returns validated Structured Output", async () => {
    const gateway: MindmapModelGateway = {
      generate: vi.fn().mockResolvedValue({
        status: "completed",
        outputText: JSON.stringify({ title: "New business", body: null, children: [] }),
      }),
    };

    await expect(generateMindmap(input, gateway)).resolves.toEqual({
      title: "New business",
      body: null,
      children: [],
    });
    expect(gateway.generate).toHaveBeenCalledWith(input);
  });

  it("maps refusal and incomplete output to safe 422 errors", async () => {
    const refused: MindmapModelGateway = {
      generate: vi.fn().mockResolvedValue({ status: "completed", outputText: "", refusal: "Cannot comply" }),
    };
    const incomplete: MindmapModelGateway = {
      generate: vi.fn().mockResolvedValue({ status: "incomplete", outputText: "" }),
    };

    await expect(generateMindmap(input, refused)).rejects.toEqual(
      expect.objectContaining<Partial<AiMindmapError>>({ status: 422, code: "model_refusal" }),
    );
    await expect(generateMindmap(input, incomplete)).rejects.toEqual(
      expect.objectContaining<Partial<AiMindmapError>>({ status: 422, code: "incomplete_output" }),
    );
  });

  it("rejects invalid JSON without exposing its content", async () => {
    const gateway: MindmapModelGateway = {
      generate: vi.fn().mockResolvedValue({ status: "completed", outputText: "not json" }),
    };
    await expect(generateMindmap(input, gateway)).rejects.toEqual(
      expect.objectContaining<Partial<AiMindmapError>>({
        status: 422,
        code: "invalid_generated_mindmap",
        message: "The model returned an invalid mindmap.",
      }),
    );
  });
});
