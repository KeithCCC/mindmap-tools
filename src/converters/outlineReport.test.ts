import { describe, expect, it } from "vitest";
import { addNode, createMindmapDocument, updateNode } from "../domain/mindmap";
import { generateOutlineMarkdownReport } from "./outlineReport";

describe("outline report generation", () => {
  it("exports a markdown outline with node notes", () => {
    let doc = createMindmapDocument("Project file");
    doc = updateNode(doc, doc.root.id, { title: "Projects", body: "Top-level project map." });
    doc = addNode(doc, doc.root.id, "FMI");
    const fmi = doc.root.children[0];
    doc = updateNode(doc, fmi.id, { body: "Research and policy ideas." });

    const report = generateOutlineMarkdownReport(doc);

    expect(report).toContain("# Project file Outline Report");
    expect(report).toContain("Root: Projects");
    expect(report).toContain("- Projects");
    expect(report).toContain("  Notes: Top-level project map.");
    expect(report).toContain("  - FMI");
    expect(report).toContain("    Notes: Research and policy ideas.");
  });
});
