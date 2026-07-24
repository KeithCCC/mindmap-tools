import { AiMindmapError, parseGenerateMindmapInput } from "../../shared/aiMindmap";
import { generateMindmap } from "../../server/openaiMindmap";

type GenerateMindmapFunction = typeof generateMindmap;

type VercelRequestLike = {
  method?: string;
  body?: unknown;
};

type VercelResponseLike = {
  setHeader(name: string, value: string): VercelResponseLike;
  status(statusCode: number): VercelResponseLike;
  json(body: unknown): VercelResponseLike;
};

export function createGenerateMindmapHandler(generate: GenerateMindmapFunction = generateMindmap) {
  return async function handler(request: VercelRequestLike, response: VercelResponseLike) {
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      return response.status(405).json({ error: "Method not allowed.", code: "method_not_allowed" });
    }

    try {
      const input = parseGenerateMindmapInput(request.body);
      const mindmap = await generate(input);
      return response.status(200).json({ mindmap });
    } catch (error) {
      if (error instanceof AiMindmapError) {
        return response.status(error.status).json({ error: error.message, code: error.code });
      }
      console.error("Mindmap generation failed");
      return response.status(500).json({ error: "Mindmap generation failed.", code: "generation_failed" });
    }
  };
}

export default createGenerateMindmapHandler();
