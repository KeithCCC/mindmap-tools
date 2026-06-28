import { describe, expect, it } from "vitest";
import {
  addNode,
  createMindmapDocument,
  deleteNode,
  findNode,
  findParentNode,
  insertIntermediateNode,
  moveNode,
  reorderNode,
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

  it("finds a nested node parent before deletion", () => {
    let doc = createMindmapDocument("Product ideas");
    doc = addNode(doc, doc.root.id, "Parent");
    const parent = doc.root.children[0];
    doc = addNode(doc, parent.id, "Child");
    const child = findNode(doc.root, parent.id)?.children[0];

    expect(child).toBeDefined();
    expect(findParentNode(doc.root, child!.id)?.id).toBe(parent.id);
  });

  it("deletes only the selected node and promotes its children", () => {
    let doc = createMindmapDocument("Root");
    doc = addNode(doc, doc.root.id, "A");
    const a = doc.root.children[0];
    doc = addNode(doc, a.id, "B");
    const b = findNode(doc.root, a.id)?.children[0];
    expect(b).toBeDefined();
    doc = addNode(doc, b!.id, "C");
    const c = findNode(doc.root, b!.id)?.children[0];
    expect(c).toBeDefined();

    doc = deleteNode(doc, b!.id);

    expect(findNode(doc.root, b!.id)).toBeUndefined();
    expect(findNode(doc.root, a.id)?.children[0].id).toBe(c!.id);
    expect(findParentNode(doc.root, c!.id)?.id).toBe(a.id);
  });

  it("keeps document title separate from root node title", () => {
    let doc = createMindmapDocument("Project file");
    doc = updateNode(doc, doc.root.id, { title: "Root topic" });

    expect(doc.title).toBe("Project file");
    expect(doc.root.title).toBe("Root topic");
  });

  it("inserts an intermediate node before a selected non-root node", () => {
    let doc = createMindmapDocument("Root");
    doc = addNode(doc, doc.root.id, "A");
    const a = doc.root.children[0];
    doc = addNode(doc, a.id, "B");
    const b = findNode(doc.root, a.id)?.children[0];
    expect(b).toBeDefined();

    const result = insertIntermediateNode(doc, b!.id, "Bridge");

    expect(result.node.title).toBe("Bridge");
    const updatedA = findNode(result.document.root, a.id);
    expect(updatedA?.children[0].id).toBe(result.node.id);
    expect(updatedA?.children[0].children[0].id).toBe(b!.id);
  });

  it("inserts an intermediate node after the root when the root is selected", () => {
    let doc = createMindmapDocument("Root");
    doc = addNode(doc, doc.root.id, "Child");
    const child = doc.root.children[0];

    const result = insertIntermediateNode(doc, doc.root.id, "Bridge");

    expect(result.document.root.children[0].id).toBe(result.node.id);
    expect(result.document.root.children[0].children[0].id).toBe(child.id);
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
    expect(findNode(doc.root, a.id)?.children).toHaveLength(0);
  });

  it("reorders a node before or after another node", () => {
    let doc = createMindmapDocument("Root");
    doc = addNode(doc, doc.root.id, "A");
    doc = addNode(doc, doc.root.id, "B");
    doc = addNode(doc, doc.root.id, "C");
    const [a, b, c] = doc.root.children;

    doc = reorderNode(doc, c.id, a.id, "before");
    expect(doc.root.children.map((node) => node.title)).toEqual(["C", "A", "B"]);

    doc = reorderNode(doc, c.id, b.id, "after");
    expect(doc.root.children.map((node) => node.title)).toEqual(["A", "B", "C"]);
  });
});
