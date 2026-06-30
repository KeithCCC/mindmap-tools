import { MindmapDocument, MindmapNode } from "../domain/mindmap";

function indent(depth: number): string {
  return "  ".repeat(depth);
}

function cleanBody(body?: string): string {
  const trimmed = body?.trim();
  return trimmed || "_No notes._";
}

function renderNode(node: MindmapNode, depth: number): string[] {
  const lines = [`${indent(depth)}- ${node.title}`];
  lines.push(`${indent(depth + 1)}Notes: ${cleanBody(node.body)}`);
  for (const child of node.children) {
    lines.push(...renderNode(child, depth + 1));
  }
  return lines;
}

export function generateOutlineMarkdownReport(document: MindmapDocument): string {
  const lines = [
    `# ${document.title} Outline Report`,
    "",
    `Root: ${document.root.title}`,
    `Generated: ${new Date(document.updatedAt).toISOString()}`,
    "",
    "## Outline",
    "",
    ...renderNode(document.root, 0),
    "",
  ];
  return lines.join("\n");
}
