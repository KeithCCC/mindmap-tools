import { describe, expect, it } from "vitest";
import { addNode, createMindmapDocument, updateNode } from "../domain/mindmap";
import { fromMindElixirData, toMindElixirData } from "./mindElixir";

describe("Mind Elixir conversion", () => {
  it("converts canonical documents to Mind Elixir data", () => {
    let doc = createMindmapDocument("Brainstorm");
    doc = addNode(doc, doc.root.id, "Audience");
    doc = updateNode(doc, doc.root.children[0].id, { body: "People with early ideas.", visual: { color: "#dcfce7" } });

    const data = toMindElixirData(doc);

    expect(data.nodeData.topic).toBe("Brainstorm");
    expect(data.nodeData.children?.[0].topic).toBe("Audience");
    expect(data.nodeData.children?.[0].note).toBe("People with early ideas.");
    expect(data.nodeData.children?.[0].style?.background).toBe("#dcfce7");
    expect(data.meta?.mindmapToolsDocumentId).toBe(doc.id);
  });

  it("converts Mind Elixir edits back to canonical documents while preserving ids", () => {
    const doc = createMindmapDocument("Brainstorm");
    const data = toMindElixirData(doc);
    data.nodeData.topic = "Updated";
    data.nodeData.children = [{ id: "child-1", topic: "New child", note: "Captured note", style: { background: "#fee2e2" } }];

    const next = fromMindElixirData(data, doc);

    expect(next.root.id).toBe(doc.root.id);
    expect(next.root.title).toBe("Updated");
    expect(next.root.children[0]).toMatchObject({
      id: "child-1",
      title: "New child",
      body: "Captured note",
      visual: { color: "#fee2e2" },
    });
  });
});
