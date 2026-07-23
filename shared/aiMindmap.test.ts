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
