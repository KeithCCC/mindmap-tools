export const AI_MINDMAP_LIMITS = {
  themeLength: 200,
  instructionsLength: 2_000,
  nodes: 250,
  depth: 6,
  children: 12,
} as const;

export interface GenerateMindmapInput {
  theme: string;
  instructions?: string;
}

export interface GeneratedMindmapNode {
  title: string;
  body: string | null;
  children: GeneratedMindmapNode[];
}

export interface GenerateMindmapResponse {
  mindmap: GeneratedMindmapNode;
}

export class AiMindmapError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "AiMindmapError";
  }
}

const nodeProperties = {
  title: { type: "string" },
  body: { type: ["string", "null"] },
  children: { type: "array", items: { $ref: "#/$defs/node" } },
} as const;

export const MINDMAP_JSON_SCHEMA = {
  type: "object",
  properties: nodeProperties,
  required: ["title", "body", "children"],
  additionalProperties: false,
  $defs: {
    node: {
      type: "object",
      properties: nodeProperties,
      required: ["title", "body", "children"],
      additionalProperties: false,
    },
  },
} as const;

function fail(message: string, status: number, code: string): never {
  throw new AiMindmapError(message, status, code);
}

export function parseGenerateMindmapInput(value: unknown): GenerateMindmapInput {
  if (!value || typeof value !== "object") fail("Request body must be an object.", 400, "invalid_request");
  const candidate = value as { theme?: unknown; instructions?: unknown };
  if (typeof candidate.theme !== "string" || !candidate.theme.trim()) {
    fail("Theme is required.", 400, "theme_required");
  }
  const theme = candidate.theme.trim();
  if (theme.length > AI_MINDMAP_LIMITS.themeLength) {
    fail(`Theme must be ${AI_MINDMAP_LIMITS.themeLength} characters or fewer.`, 400, "theme_too_long");
  }
  if (candidate.instructions !== undefined && typeof candidate.instructions !== "string") {
    fail("Additional instructions must be text.", 400, "invalid_instructions");
  }
  const instructions = typeof candidate.instructions === "string" ? candidate.instructions.trim() : "";
  if (instructions.length > AI_MINDMAP_LIMITS.instructionsLength) {
    fail(
      `Additional instructions must be ${AI_MINDMAP_LIMITS.instructionsLength} characters or fewer.`,
      400,
      "instructions_too_long",
    );
  }
  return instructions ? { theme, instructions } : { theme };
}

export function parseGeneratedMindmap(value: unknown): GeneratedMindmapNode {
  let nodeCount = 0;

  const visit = (candidate: unknown, depth: number): GeneratedMindmapNode => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      fail("Generated mindmap is invalid.", 422, "invalid_generated_mindmap");
    }
    const record = candidate as Record<string, unknown>;
    if (
      Object.keys(record).some((key) => !["title", "body", "children"].includes(key)) ||
      typeof record.title !== "string" ||
      !record.title.trim() ||
      (record.body !== null && typeof record.body !== "string") ||
      !Array.isArray(record.children)
    ) {
      fail("Generated mindmap is invalid.", 422, "invalid_generated_mindmap");
    }
    nodeCount += 1;
    if (
      nodeCount > AI_MINDMAP_LIMITS.nodes ||
      depth > AI_MINDMAP_LIMITS.depth ||
      record.children.length > AI_MINDMAP_LIMITS.children
    ) {
      fail("Generated mindmap exceeds the accepted size.", 422, "generated_mindmap_too_large");
    }
    return {
      title: record.title.trim(),
      body: typeof record.body === "string" ? record.body.trim() || null : null,
      children: record.children.map((child) => visit(child, depth + 1)),
    };
  };

  return visit(value, 1);
}
