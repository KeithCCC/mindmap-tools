import { Router } from "express";
import { AiMindmapError, parseGenerateMindmapInput } from "../shared/aiMindmap";
import { generateMindmap } from "./openaiMindmap";

export type GenerateMindmapFunction = typeof generateMindmap;

export function createAiMindmapRouter({
  generate = generateMindmap,
}: {
  generate?: GenerateMindmapFunction;
} = {}): Router {
  const router = Router();

  router.post("/api/ai/generate-mindmap", async (request, response) => {
    try {
      const input = parseGenerateMindmapInput(request.body);
      const mindmap = await generate(input);
      response.json({ mindmap });
    } catch (error) {
      if (error instanceof AiMindmapError) {
        response.status(error.status).json({ error: error.message, code: error.code });
        return;
      }
      console.error("Mindmap generation failed");
      response.status(500).json({ error: "Mindmap generation failed.", code: "generation_failed" });
    }
  });

  return router;
}
