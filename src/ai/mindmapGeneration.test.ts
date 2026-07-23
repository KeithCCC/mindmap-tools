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
