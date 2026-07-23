import { describe, expect, it, vi } from "vitest";
import { AiMindmapError } from "../shared/aiMindmap";
import {
  buildOpenAIRequest,
  generateMindmap,
  OPENAI_CLIENT_OPTIONS,
  OpenAIMindmapGateway,
  type MindmapModelGateway,
} from "./openaiMindmap";

const input = { theme: "New business", instructions: "Include risks" };

describe("OpenAI mindmap generation", () => {
  it("builds a strict Structured Outputs request", () => {
    expect(buildOpenAIRequest(input)).toMatchObject({
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

  it("uses the default model when OPENAI_MODEL is unset", () => {
    const previousModel = process.env.OPENAI_MODEL;
    delete process.env.OPENAI_MODEL;

    try {
      expect(buildOpenAIRequest(input).model).toBe("gpt-5.6-sol");
    } finally {
      if (previousModel === undefined) delete process.env.OPENAI_MODEL;
      else process.env.OPENAI_MODEL = previousModel;
    }
  });

  it("uses the approved OPENAI_MODEL operational override", () => {
    const previousModel = process.env.OPENAI_MODEL;
    process.env.OPENAI_MODEL = "approved-operational-model";

    try {
      expect(buildOpenAIRequest(input).model).toBe("approved-operational-model");
    } finally {
      if (previousModel === undefined) delete process.env.OPENAI_MODEL;
      else process.env.OPENAI_MODEL = previousModel;
    }
  });

  it("disables SDK retries and limits requests to two minutes", () => {
    expect(OPENAI_CLIENT_OPTIONS).toEqual({
      maxRetries: 0,
      timeout: 120_000,
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

  it("maps refusal to a safe 422 error", async () => {
    const refused: MindmapModelGateway = {
      generate: vi.fn().mockResolvedValue({ status: "completed", outputText: "", refusal: "Cannot comply" }),
    };

    await expect(generateMindmap(input, refused)).rejects.toEqual(
      expect.objectContaining<Partial<AiMindmapError>>({ status: 422, code: "model_refusal" }),
    );
  });

  it("maps incomplete status to a sanitized 422 error", async () => {
    const incomplete: MindmapModelGateway = {
      generate: vi.fn().mockResolvedValue({ status: "incomplete", outputText: "sensitive partial output" }),
    };

    await expect(generateMindmap(input, incomplete)).rejects.toEqual(
      expect.objectContaining<Partial<AiMindmapError>>({
        status: 422,
        code: "incomplete_output",
        message: "The model response was incomplete.",
      }),
    );
  });

  it.each(["failed", "cancelled", "queued", "in_progress", "unexpected_status"])(
    "maps %s status to a sanitized 502 upstream error",
    async (status) => {
      const gateway: MindmapModelGateway = {
        generate: vi.fn().mockResolvedValue({ status, outputText: "sensitive upstream detail" }),
      };

      await expect(generateMindmap(input, gateway)).rejects.toEqual(
        expect.objectContaining<Partial<AiMindmapError>>({
          status: 502,
          code: "openai_upstream_error",
          message: "OpenAI request failed.",
        }),
      );
    },
  );

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
