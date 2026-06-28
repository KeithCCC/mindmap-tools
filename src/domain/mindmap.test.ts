import { describe, expect, it } from "vitest";
import {
  addNode,
  createMindmapDocument,
  deleteNode,
  findNode,
  moveNode,
  updateNode,
  validateTree,
} from "./mindmap";

describe("mindmap tree operations", () => {
  it("creates, renames, deletes, and validates nodes", () => {
    let doc = createMindmapDocument("Product ideas");
    doc = addNode(doc, doc.root.id, "Acquisition");
    const child = doc.root.children[0];

    doc = updateNode(doc, child.id, { title: "Growth loops" });
    expect(findNode(doc.root, child.id)?.title).toBe("Growth loops");

    expect(validateTree(doc)).toEqual([]);

    doc = deleteNode(doc, child.id);
    expect(doc.root.children).toHaveLength(0);
  });

  it("keeps document title separate from root node title", () => {
    let doc = createMindmapDocument("Project file");
    doc = updateNode(doc, doc.root.id, { title: "Root topic" });

    expect(doc.title).toBe("Project file");
    expect(doc.root.title).toBe("Root topic");
  });

  it("moves nodes without allowing invalid cycles", () => {
    let doc = createMindmapDocument("Root");
    doc = addNode(doc, doc.root.id, "A");
    const a = doc.root.children[0];
    doc = addNode(doc, a.id, "B");
    const b = findNode(doc.root, a.id)?.children[0];
    expect(b).toBeDefined();

    expect(() => moveNode(doc, a.id, b!.id)).toThrow("Cannot move a node into its own descendant");

    doc = addNode(doc, doc.root.id, "C");
    const c = doc.root.children[1];
    doc = moveNode(doc, b!.id, c.id);
    expect(findNode(doc.root, c.id)?.children[0].title).toBe("B");
  });
});
