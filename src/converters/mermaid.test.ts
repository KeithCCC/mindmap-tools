import { describe, expect, it } from "vitest";
import { parseMermaidMindmap, serializeMermaidMindmap } from "./mermaid";

describe("Mermaid mindmap conversion", () => {
  it("exports a nested map and imports it back", () => {
    const result = parseMermaidMindmap(`
mindmap
  Brainstorm
    "Growth / marketing"
      SEO
      "Partner channels"
    Product
`);

    expect(result.warnings).toEqual([]);
    expect(result.document.root.title).toBe("Brainstorm");
    expect(result.document.root.children[0].children[1].title).toBe("Partner channels");

    const serialized = serializeMermaidMindmap(result.document);
    expect(serialized).toContain("mindmap");
    expect(serialized).toContain('"Growth / marketing"');

    const reparsed = parseMermaidMindmap(serialized);
    expect(reparsed.document.root.children[1].title).toBe("Product");
  });

  it("returns warnings for unsupported malformed indentation", () => {
    const result = parseMermaidMindmap(`
mindmap
  Root
       Too deep
`);

    expect(result.warnings[0]).toContain("indentation");
  });
});
