import { describe, expect, it } from "vitest";
import { createMindmapDocument, addNode } from "../domain/mindmap";
import { parseExcalidrawMindmap, serializeExcalidrawMindmap } from "./excalidraw";

describe("Excalidraw conversion", () => {
  it("round-trips app-generated Excalidraw JSON", () => {
    let doc = createMindmapDocument("Ideas");
    doc = addNode(doc, doc.root.id, "Research");
    doc = addNode(doc, doc.root.children[0].id, "Interview users");

    const exported = serializeExcalidrawMindmap(doc);
    const imported = parseExcalidrawMindmap(exported);

    expect(imported.warnings).toEqual([]);
    expect(imported.document.root.title).toBe("Ideas");
    expect(imported.document.root.children[0].children[0].title).toBe("Interview users");
  });

  it("preserves hierarchy while applying text edits from app-generated elements", () => {
    let doc = createMindmapDocument("Ideas");
    doc = addNode(doc, doc.root.id, "Research");

    const exported = serializeExcalidrawMindmap(doc) as {
      elements: Array<{ text?: string; customData?: { mindmapToolsNodeId?: string } }>;
      appState: { mindmapToolsDocument: typeof doc };
    };
    const researchElement = exported.elements.find(
      (element) => element.customData?.mindmapToolsNodeId === doc.root.children[0].id,
    );
    researchElement!.text = "Customer discovery";

    const imported = parseExcalidrawMindmap(exported);

    expect(imported.document.root.children[0].title).toBe("Customer discovery");
    expect(imported.document.root.children[0].id).toBe(doc.root.children[0].id);
  });

  it("best-effort imports generic text elements with warnings", () => {
    const imported = parseExcalidrawMindmap({
      type: "excalidraw",
      elements: [
        { type: "text", text: "First", x: 10, y: 10 },
        { type: "text", text: "Second", x: 20, y: 100 },
      ],
    });

    expect(imported.document.root.title).toBe("Imported Excalidraw");
    expect(imported.document.root.children.map((node) => node.title)).toEqual(["First", "Second"]);
    expect(imported.warnings[0]).toContain("best-effort");
  });
});
