import OpenAI from "openai";
import {
  AiMindmapError,
  type GenerateMindmapInput,
  type GeneratedMindmapNode,
  MINDMAP_JSON_SCHEMA,
  parseGeneratedMindmap,
} from "../shared/aiMindmap";

export interface ModelGatewayResult {
  status: string;
  outputText: string;
  refusal?: string;
}

export interface MindmapModelGateway {
  generate(input: GenerateMindmapInput): Promise<ModelGatewayResult>;
}

function buildInstructions(): string {
  return [
    "Generate a practical hierarchical mindmap.",
    "Use the same language as the user's theme and additional instructions.",
    "Keep titles concise and use body for an optional one-sentence explanation.",
    "Follow explicit size instructions. If none are supplied, use at most three levels and four children per node.",
    "Stay within six levels, 250 total nodes, and 12 children per node.",
  ].join(" ");
}

export function buildOpenAIRequest(input: GenerateMindmapInput) {
  return {
    model: process.env.OPENAI_MODEL ?? "gpt-5.6-sol",
    instructions: buildInstructions(),
    input: [
      `Theme: ${input.theme}`,
      input.instructions ? `Additional instructions: ${input.instructions}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    max_output_tokens: 6_000,
    text: {
      format: {
        type: "json_schema" as const,
        name: "mindmap",
        strict: true,
        schema: MINDMAP_JSON_SCHEMA as unknown as Record<string, unknown>,
      },
    },
  };
}

export class OpenAIMindmapGateway implements MindmapModelGateway {
  private readonly client: OpenAI;

  constructor(apiKey = process.env.OPENAI_API_KEY) {
    if (!apiKey) throw new AiMindmapError("OpenAI is not configured.", 503, "openai_not_configured");
    this.client = new OpenAI({ apiKey });
  }

  async generate(input: GenerateMindmapInput): Promise<ModelGatewayResult> {
    try {
      const response = await this.client.responses.create(buildOpenAIRequest(input));
      const refusal = response.output
        .filter((item) => item.type === "message")
        .flatMap((item) => item.content)
        .find((item) => item.type === "refusal");
      return {
        status: response.status ?? "completed",
        outputText: response.output_text,
        refusal: refusal?.type === "refusal" ? refusal.refusal : undefined,
      };
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        if (error.status === 429) {
          throw new AiMindmapError("OpenAI rate limit or quota was reached.", 429, "openai_rate_limit");
        }
        throw new AiMindmapError("OpenAI request failed.", 502, "openai_upstream_error");
      }
      if (error instanceof AiMindmapError) throw error;
      throw new AiMindmapError("OpenAI request failed.", 502, "openai_upstream_error");
    }
  }
}

export async function generateMindmap(
  input: GenerateMindmapInput,
  gateway: MindmapModelGateway = new OpenAIMindmapGateway(),
): Promise<GeneratedMindmapNode> {
  const result = await gateway.generate(input);
  if (result.refusal) throw new AiMindmapError("The model declined this request.", 422, "model_refusal");
  if (result.status !== "completed" || !result.outputText) {
    throw new AiMindmapError("The model response was incomplete.", 422, "incomplete_output");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.outputText);
  } catch {
    throw new AiMindmapError("The model returned an invalid mindmap.", 422, "invalid_generated_mindmap");
  }
  try {
    return parseGeneratedMindmap(parsed);
  } catch (error) {
    if (error instanceof AiMindmapError) {
      throw new AiMindmapError("The model returned an invalid mindmap.", error.status, error.code);
    }
    throw error;
  }
}
