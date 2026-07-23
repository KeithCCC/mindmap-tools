# AI Mindmap Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI tab that generates a complete mindmap from a theme and optional instructions, replacing the current map only after a successful server-side OpenAI Responses API call.

**Architecture:** The Express server owns the OpenAI SDK and API key, validates input, requests a strict Structured Output, and returns a semantic tree without application IDs. The React client converts that tree into the existing `MindmapDocument` shape and applies it through `commitDocument`, preserving the current map in the undo stack.

**Tech Stack:** TypeScript, React 18, Express 5, OpenAI Node SDK, Responses API, Structured Outputs, Vitest, Testing Library

## Global Constraints

- Keep `OPENAI_API_KEY` server-side; never send it to the browser or print it.
- Accept a required theme of at most 200 characters and optional instructions of at most 2,000 characters.
- Follow explicit size instructions; otherwise target at most three levels and four children per node.
- Reject generated maps above 250 total nodes, six levels, or 12 children per node.
- Use a 6,000 output-token cap.
- Match the language of the theme and instructions.
- Replace the current map only after a complete validated response.
- Preserve the current document ID and `createdAt`; generate fresh node IDs and a new `updatedAt`.
- Keep the current map unchanged on every failure path.
- Do not add streaming, model selection, selected-node expansion, or generated alternatives.

## File Structure

- Create `shared/aiMindmap.ts`: shared request/response types, strict JSON Schema, input validation, generated-tree validation, and safe error type.
- Create `shared/aiMindmap.test.ts`: contract and structural-limit tests.
- Create `server/openaiMindmap.ts`: official OpenAI SDK adapter, prompt construction, refusal/incomplete handling, and sanitized upstream error mapping.
- Create `server/openaiMindmap.test.ts`: model gateway tests with an injected fake gateway.
- Create `server/aiMindmapRouter.ts`: isolated Express router for `POST /api/ai/generate-mindmap`.
- Create `server/aiMindmapRouter.test.ts`: HTTP behavior tests with Supertest.
- Modify `server/index.ts`: mount the AI router without changing existing Neon routes.
- Create `src/ai/mindmapGeneration.ts`: convert semantic generated nodes to the existing application document.
- Create `src/ai/mindmapGeneration.test.ts`: ID, metadata, and replacement conversion tests.
- Modify `src/App.tsx`: AI tab, request state, generation action, and undo-aware replacement.
- Modify `src/App.test.tsx`: user-facing generation, loading, failure, and undo tests.
- Modify `src/styles.css`: compact AI tab status styles consistent with the existing inspector.
- Modify `package.json` and `package-lock.json`: add `openai`, `supertest`, and `@types/supertest`.

---

### Task 1: Shared AI Mindmap Contract

**Files:**
- Create: `shared/aiMindmap.ts`
- Create: `shared/aiMindmap.test.ts`

**Interfaces:**
- Consumes: unknown HTTP request bodies and unknown parsed model output.
- Produces:
  - `GenerateMindmapInput`
  - `GeneratedMindmapNode`
  - `GenerateMindmapResponse`
  - `MINDMAP_JSON_SCHEMA`
  - `AiMindmapError`
  - `parseGenerateMindmapInput(value: unknown): GenerateMindmapInput`
  - `parseGeneratedMindmap(value: unknown): GeneratedMindmapNode`

- [ ] **Step 1: Write failing contract tests**

Create `shared/aiMindmap.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  AiMindmapError,
  MINDMAP_JSON_SCHEMA,
  parseGenerateMindmapInput,
  parseGeneratedMindmap,
} from "./aiMindmap";

function makeChain(levels: number): unknown {
  let node: unknown = { title: `Level ${levels}`, body: null, children: [] };
  for (let level = levels - 1; level >= 1; level -= 1) {
    node = { title: `Level ${level}`, body: null, children: [node] };
  }
  return node;
}

function expectAiMindmapError(action: () => unknown, expected: { status: number; code?: string }) {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(AiMindmapError);
  expect(thrown).toMatchObject(expected);
}

describe("AI mindmap contract", () => {
  it("trims a valid request", () => {
    expect(parseGenerateMindmapInput({ theme: "  New business  ", instructions: "  Include risks  " })).toEqual({
      theme: "New business",
      instructions: "Include risks",
    });
  });

  it("rejects an empty theme and oversized instructions", () => {
    expect(() => parseGenerateMindmapInput({ theme: "   " })).toThrow(AiMindmapError);
    expectAiMindmapError(
      () => parseGenerateMindmapInput({ theme: "Plan", instructions: "x".repeat(2001) }),
      { status: 400 },
    );
  });

  it("defines a strict recursive object schema", () => {
    expect(MINDMAP_JSON_SCHEMA.type).toBe("object");
    expect(MINDMAP_JSON_SCHEMA.required).toEqual(["title", "body", "children"]);
    expect(MINDMAP_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(MINDMAP_JSON_SCHEMA.$defs.node.additionalProperties).toBe(false);
  });

  it("accepts a valid semantic tree", () => {
    const value = {
      title: "Launch",
      body: "Plan a product launch.",
      children: [{ title: "Research", body: null, children: [] }],
    };
    expect(parseGeneratedMindmap(value)).toEqual(value);
  });

  it("rejects extra keys and structural limits", () => {
    expectAiMindmapError(
      () => parseGeneratedMindmap({ title: "Plan", body: null, children: [], extra: true }),
      { status: 422 },
    );
    expectAiMindmapError(() => parseGeneratedMindmap(makeChain(7)), { status: 422 });
    expectAiMindmapError(
      () =>
        parseGeneratedMindmap({
          title: "Plan",
          body: null,
          children: Array.from({ length: 13 }, (_, index) => ({
            title: `Child ${index}`,
            body: null,
            children: [],
          })),
        }),
      { status: 422 },
    );
  });

  it("rejects more than 250 total nodes", () => {
    expectAiMindmapError(
      () =>
        parseGeneratedMindmap({
          title: "Plan",
          body: null,
          children: Array.from({ length: 12 }, (_, branch) => ({
            title: `Branch ${branch}`,
            body: null,
            children: Array.from({ length: 12 }, (_, group) => ({
              title: `Group ${branch}-${group}`,
              body: null,
              children: Array.from({ length: 2 }, (_, leaf) => ({
                title: `Leaf ${branch}-${group}-${leaf}`,
                body: null,
                children: [],
              })),
            })),
          })),
        }),
      { status: 422, code: "generated_mindmap_too_large" },
    );
  });
});
```

- [ ] **Step 2: Run the contract tests and verify RED**

Run:

```powershell
npm test -- shared/aiMindmap.test.ts
```

Expected: FAIL because `shared/aiMindmap.ts` does not exist.

- [ ] **Step 3: Implement the shared contract**

Create `shared/aiMindmap.ts`:

```ts
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
```

- [ ] **Step 4: Run the contract tests and verify GREEN**

Run:

```powershell
npm test -- shared/aiMindmap.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit the shared contract**

```powershell
git add shared/aiMindmap.ts shared/aiMindmap.test.ts
git commit -m "feat: add AI mindmap contract"
```

---

### Task 2: OpenAI Responses API Adapter

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `server/openaiMindmap.ts`
- Create: `server/openaiMindmap.test.ts`

**Interfaces:**
- Consumes:
  - `GenerateMindmapInput`
  - `MINDMAP_JSON_SCHEMA`
  - `parseGeneratedMindmap`
- Produces:
  - `MindmapModelGateway`
  - `OpenAIMindmapGateway`
  - `buildOpenAIRequest(input: GenerateMindmapInput)`
  - `generateMindmap(input: GenerateMindmapInput, gateway?: MindmapModelGateway): Promise<GeneratedMindmapNode>`

- [ ] **Step 1: Install the official SDK**

Run:

```powershell
npm install openai
```

Expected: `openai` appears under `dependencies` and the lockfile updates.

- [ ] **Step 2: Write failing adapter tests**

Create `server/openaiMindmap.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the adapter tests and verify RED**

Run:

```powershell
npm test -- server/openaiMindmap.test.ts
```

Expected: FAIL because `server/openaiMindmap.ts` does not exist.

- [ ] **Step 4: Implement the SDK adapter**

Create `server/openaiMindmap.ts`:

```ts
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
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
npm test -- server/openaiMindmap.test.ts shared/aiMindmap.test.ts
```

Expected: 10 tests pass.

- [ ] **Step 6: Type-check the SDK integration**

Run:

```powershell
npx tsc -p tsconfig.node.json
```

Expected: exit 0 with no TypeScript errors.

- [ ] **Step 7: Commit the adapter**

```powershell
git add package.json package-lock.json server/openaiMindmap.ts server/openaiMindmap.test.ts
git commit -m "feat: add OpenAI mindmap generator"
```

---

### Task 3: AI Generation HTTP Route

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `server/aiMindmapRouter.ts`
- Create: `server/aiMindmapRouter.test.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Consumes:
  - `parseGenerateMindmapInput(value: unknown)`
  - `generateMindmap(input)`
- Produces:
  - `GenerateMindmapFunction`
  - `createAiMindmapRouter(options?: { generate?: typeof generateMindmap }): Router`
  - `POST /api/ai/generate-mindmap`

- [ ] **Step 1: Install HTTP test dependencies**

Run:

```powershell
npm install --save-dev supertest @types/supertest
```

Expected: `supertest` and `@types/supertest` appear under `devDependencies`.

- [ ] **Step 2: Write failing HTTP tests**

Create `server/aiMindmapRouter.test.ts`:

```ts
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
```

- [ ] **Step 3: Run HTTP tests and verify RED**

Run:

```powershell
npm test -- server/aiMindmapRouter.test.ts
```

Expected: FAIL because `server/aiMindmapRouter.ts` does not exist.

- [ ] **Step 4: Implement the isolated router**

Create `server/aiMindmapRouter.ts`:

```ts
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
```

- [ ] **Step 5: Mount the router**

Modify `server/index.ts`:

```ts
import { createAiMindmapRouter } from "./aiMindmapRouter";
```

Add immediately after `app.use(express.json({ limit: "5mb" }));`:

```ts
app.use(createAiMindmapRouter());
```

- [ ] **Step 6: Run HTTP and server tests and verify GREEN**

Run:

```powershell
npm test -- server/aiMindmapRouter.test.ts server/openaiMindmap.test.ts shared/aiMindmap.test.ts
```

Expected: 13 tests pass.

- [ ] **Step 7: Type-check the server**

Run:

```powershell
npx tsc -p tsconfig.node.json
```

Expected: exit 0.

- [ ] **Step 8: Commit the route**

```powershell
git add package.json package-lock.json server/aiMindmapRouter.ts server/aiMindmapRouter.test.ts server/index.ts
git commit -m "feat: expose AI mindmap endpoint"
```

---

### Task 4: Generated Tree to Application Document Conversion

**Files:**
- Create: `src/ai/mindmapGeneration.ts`
- Create: `src/ai/mindmapGeneration.test.ts`

**Interfaces:**
- Consumes:
  - `GeneratedMindmapNode`
  - existing `MindmapDocument`
  - existing `createNode`
- Produces:
  - `replaceWithGeneratedMindmap(current: MindmapDocument, generated: GeneratedMindmapNode, now?: string): MindmapDocument`

- [ ] **Step 1: Write failing conversion tests**

Create `src/ai/mindmapGeneration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createMindmapDocument, flattenNodes } from "../domain/mindmap";
import { replaceWithGeneratedMindmap } from "./mindmapGeneration";

describe("replaceWithGeneratedMindmap", () => {
  it("preserves document identity and replaces semantic content", () => {
    const current = createMindmapDocument("Old map");
    const next = replaceWithGeneratedMindmap(
      current,
      {
        title: "Launch",
        body: "Launch plan",
        children: [{ title: "Research", body: null, children: [] }],
      },
      "2026-07-23T12:00:00.000Z",
    );
    expect(next).toMatchObject({
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: "2026-07-23T12:00:00.000Z",
      title: "Launch",
      root: { title: "Launch", body: "Launch plan" },
    });
    expect(next.root.id).not.toBe(current.root.id);
    expect(next.root.children[0]).toMatchObject({ title: "Research", body: undefined, children: [] });
    expect(new Set(flattenNodes(next.root).map((node) => node.id)).size).toBe(2);
  });
});
```

- [ ] **Step 2: Run conversion tests and verify RED**

Run:

```powershell
npm test -- src/ai/mindmapGeneration.test.ts
```

Expected: FAIL because `src/ai/mindmapGeneration.ts` does not exist.

- [ ] **Step 3: Implement conversion**

Create `src/ai/mindmapGeneration.ts`:

```ts
import type { GeneratedMindmapNode } from "../../shared/aiMindmap";
import { createNode, type MindmapDocument, type MindmapNode } from "../domain/mindmap";

function toMindmapNode(generated: GeneratedMindmapNode): MindmapNode {
  const node = createNode(generated.title, generated.children.map(toMindmapNode));
  return generated.body ? { ...node, body: generated.body } : node;
}

export function replaceWithGeneratedMindmap(
  current: MindmapDocument,
  generated: GeneratedMindmapNode,
  now = new Date().toISOString(),
): MindmapDocument {
  const root = toMindmapNode(generated);
  return {
    ...current,
    title: root.title,
    root,
    updatedAt: now,
  };
}
```

- [ ] **Step 4: Run conversion tests and verify GREEN**

Run:

```powershell
npm test -- src/ai/mindmapGeneration.test.ts
```

Expected: 1 test passes.

- [ ] **Step 5: Commit conversion**

```powershell
git add src/ai/mindmapGeneration.ts src/ai/mindmapGeneration.test.ts
git commit -m "feat: convert generated mindmaps"
```

---

### Task 5: AI Tab and Undo-Aware Replacement

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes:
  - `POST /api/ai/generate-mindmap`
  - `GenerateMindmapResponse`
  - `replaceWithGeneratedMindmap`
  - existing `commitDocument`
- Produces:
  - AI property-inspector tab with required theme, optional instructions, loading state, status, and Generate command.

- [ ] **Step 1: Write the failing success and undo test**

Add to `src/App.test.tsx`:

```ts
it("generates a replacement mindmap and restores the previous map with Undo", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          mindmap: {
            title: "Launch plan",
            body: null,
            children: [{ title: "Research", body: null, children: [] }],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ),
  );
  render(<App />);
  await openProperties(user);
  await user.click(screen.getByRole("tab", { name: "AI" }));
  await user.type(screen.getByLabelText("Theme"), "Launch plan");
  await user.type(screen.getByLabelText("Additional instructions"), "Include research");
  await user.click(screen.getByRole("button", { name: "Generate mindmap" }));

  await waitFor(() => expect(screen.getByRole("heading", { name: "Launch plan" })).toBeInTheDocument());
  expect(fetch).toHaveBeenCalledWith(
    "/api/ai/generate-mindmap",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ theme: "Launch plan", instructions: "Include research" }),
    }),
  );
  await user.click(screen.getByRole("button", { name: "Outline" }));
  expect(screen.getByRole("button", { name: "Research" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Close" }));
  await user.click(screen.getByRole("button", { name: "Undo" }));
  expect(screen.getByRole("heading", { name: "Brainstorm" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Write failing validation, loading, and failure tests**

Add to `src/App.test.tsx`:

```ts
it("requires a theme before generating", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  render(<App />);
  await openProperties(user);
  await user.click(screen.getByRole("tab", { name: "AI" }));
  await user.click(screen.getByRole("button", { name: "Generate mindmap" }));
  expect(screen.getByRole("status")).toHaveTextContent("Theme is required.");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("disables duplicate generation while a request is active", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
  render(<App />);
  await openProperties(user);
  await user.click(screen.getByRole("tab", { name: "AI" }));
  await user.type(screen.getByLabelText("Theme"), "Plan");
  await user.click(screen.getByRole("button", { name: "Generate mindmap" }));
  expect(screen.getByRole("button", { name: "Generating..." })).toBeDisabled();
});

it("keeps the current map when generation fails", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "OpenAI rate limit or quota was reached." }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
  render(<App />);
  await openProperties(user);
  await user.click(screen.getByRole("tab", { name: "AI" }));
  await user.type(screen.getByLabelText("Theme"), "Plan");
  await user.click(screen.getByRole("button", { name: "Generate mindmap" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("OpenAI rate limit or quota was reached."));
  expect(screen.getByRole("heading", { name: "Brainstorm" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
});
```

- [ ] **Step 3: Run the App tests and verify RED**

Run:

```powershell
npm test -- src/App.test.tsx
```

Expected: the new tests fail because the AI tab does not exist.

- [ ] **Step 4: Add state, generation action, and imports**

Modify `src/App.tsx` imports and tab type:

```ts
import type { GenerateMindmapResponse } from "../shared/aiMindmap";
import { replaceWithGeneratedMindmap } from "./ai/mindmapGeneration";

type Tab = "edit" | "ai" | "cloud" | "import" | "export" | "wiki";
```

Add state with the existing inspector state:

```ts
const [aiTheme, setAiTheme] = useState("");
const [aiInstructions, setAiInstructions] = useState("");
const [aiStatus, setAiStatus] = useState("Enter a theme to generate a new mindmap.");
const [isAiGenerating, setIsAiGenerating] = useState(false);
```

Add the action before the JSX return:

```ts
const generateAiMindmap = async () => {
  const themeInput = aiTheme.trim();
  if (!themeInput) {
    setAiStatus("Theme is required.");
    return;
  }
  if (isAiGenerating) return;
  setIsAiGenerating(true);
  setAiStatus("Generating mindmap...");
  try {
    const instructions = aiInstructions.trim();
    const payload = await readApiJson<GenerateMindmapResponse>(
      await fetch("/api/ai/generate-mindmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(instructions ? { theme: themeInput, instructions } : { theme: themeInput }),
      }),
    );
    const next = replaceWithGeneratedMindmap(documentStateRef.current, payload.mindmap);
    commitDocument(next, next.root.id);
    setAiStatus(`Generated "${next.title}".`);
  } catch (error) {
    setAiStatus(error instanceof Error ? error.message : "Mindmap generation failed.");
  } finally {
    setIsAiGenerating(false);
  }
};
```

- [ ] **Step 5: Add the AI tab and panel**

Change the visible tab array in `src/App.tsx`:

```tsx
{(["edit", "ai", "import", "export", "wiki"] as Tab[]).map((tab) => (
```

Insert after the Edit section:

```tsx
{activeTab === "ai" ? (
  <section className="tool-section">
    <label>
      Theme
      <input
        value={aiTheme}
        maxLength={200}
        disabled={isAiGenerating}
        onChange={(event) => setAiTheme(event.target.value)}
      />
    </label>
    <label>
      Additional instructions
      <textarea
        value={aiInstructions}
        maxLength={2000}
        rows={7}
        disabled={isAiGenerating}
        onChange={(event) => setAiInstructions(event.target.value)}
      />
    </label>
    <button type="button" disabled={isAiGenerating} onClick={() => void generateAiMindmap()}>
      {isAiGenerating ? "Generating..." : "Generate mindmap"}
    </button>
    <p className="ai-status" role="status" aria-live="polite">
      {aiStatus}
    </p>
  </section>
) : null}
```

- [ ] **Step 6: Add restrained status styling**

Change the existing tab grid from four to five columns:

```css
.tabs {
  border-bottom: 1px solid #e6ecf5;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
}
```

Add near the existing `.tool-section` rules:

```css
.ai-status {
  min-height: 2.75rem;
  margin: 0;
  color: #64748b;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.theme-dark .ai-status {
  color: #94a3b8;
}
```

- [ ] **Step 7: Run App tests and verify GREEN**

Run:

```powershell
npm test -- src/App.test.tsx
```

Expected: all App tests pass, including the four new AI tests.

- [ ] **Step 8: Run client conversion and App tests together**

Run:

```powershell
npm test -- src/ai/mindmapGeneration.test.ts src/App.test.tsx
```

Expected: all selected tests pass with no unhandled promise warnings.

- [ ] **Step 9: Commit the AI tab**

```powershell
git add src/App.tsx src/App.test.tsx src/styles.css
git commit -m "feat: add AI mindmap tab"
```

---

### Task 6: Full Verification and Live Smoke Test

**Files:**
- Modify only files required to fix failures exposed by the verification commands.

**Interfaces:**
- Consumes: completed Tasks 1-5.
- Produces: evidence that unit, integration, build, and live API paths work without exposing secrets.

- [ ] **Step 1: Run the complete test suite**

Run:

```powershell
npm test
```

Expected: all Vitest suites pass with zero failures.

- [ ] **Step 2: Run the production build**

Run:

```powershell
npm run build
```

Expected: `tsc -b` and `vite build` exit 0.

- [ ] **Step 3: Start the API server**

Run in a persistent terminal:

```powershell
npm run dev:api
```

Expected: `Mindmap API listening on http://127.0.0.1:8787`.

- [ ] **Step 4: Run one live generation smoke test**

Run from a second terminal:

```powershell
node -e "fetch('http://127.0.0.1:8787/api/ai/generate-mindmap',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({theme:'Project launch',instructions:'Create a compact two-level map'})}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(r.status+' '+(d.code||'request_failed'));if(!d.mindmap?.title||!Array.isArray(d.mindmap.children))throw new Error('invalid response shape');console.log('AI mindmap smoke test: passed')}).catch(e=>{console.error('AI mindmap smoke test:',e.message);process.exit(1)})"
```

Expected: `AI mindmap smoke test: passed`. The command prints neither the API key nor generated content.

- [ ] **Step 5: Start the full development app**

Run in a persistent terminal:

```powershell
npm run dev
```

Expected: the API and Vite client both start; use the Vite URL printed by the command.

- [ ] **Step 6: Verify the browser workflow**

At desktop and narrow mobile widths:

1. Open Properties and select AI.
2. Enter a theme and optional instructions.
3. Generate a map and verify the heading and canvas update.
4. Press Undo and verify the previous map returns.
5. Trigger a validation error with an empty theme and confirm the map remains unchanged.
6. Confirm controls and status text do not overlap or overflow.

- [ ] **Step 7: Review the final diff**

Run:

```powershell
git status --short
git diff --check
git diff --stat
```

Expected: only intended AI feature files are modified, `git diff --check` is silent, and `.env` is absent from the diff.
