import { describe, expect, it } from "vitest";
import { addNode, createMindmapDocument, updateNode } from "../domain/mindmap";
import { generateWikiMarkdown } from "./wiki";

describe("wiki generation", () => {
  it("generates index and linked node pages with duplicate-safe slugs", () => {
    let doc = createMindmapDocument("Strategy");
    doc = addNode(doc, doc.root.id, "Research");
    doc = addNode(doc, doc.root.id, "Research");
    doc = updateNode(doc, doc.root.children[0].id, { body: "Talk to customers." });

    const files = generateWikiMarkdown(doc);

    expect(files[0].path).toBe("index.md");
    expect(files.map((file) => file.path)).toContain("strategy.md");
    expect(files.map((file) => file.path).filter((path) => path.startsWith("research"))).toHaveLength(2);
    expect(files.find((file) => file.path === "strategy.md")?.content).toContain("[Research]");
    expect(files.find((file) => file.path.startsWith("research"))?.content).toContain("Talk to customers.");
  });
});
