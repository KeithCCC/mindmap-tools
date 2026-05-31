import { flattenNodes, MindmapDocument, MindmapNode } from "../domain/mindmap";

export interface WikiFile {
  path: string;
  content: string;
}

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "untitled";
}

export function generateWikiMarkdown(document: MindmapDocument): WikiFile[] {
  const nodes = flattenNodes(document.root);
  const baseCounts = new Map<string, number>();
  const paths = new Map<string, string>();

  for (const node of nodes) {
    const base = slugify(node.title);
    const count = baseCounts.get(base) ?? 0;
    baseCounts.set(base, count + 1);
    paths.set(node.id, `${count === 0 ? base : `${base}-${node.id.slice(-6)}`}.md`);
  }

  const parentById = new Map<string, MindmapNode>();
  const visit = (node: MindmapNode) => {
    node.children.forEach((child) => {
      parentById.set(child.id, node);
      visit(child);
    });
  };
  visit(document.root);

  const index = [
    `# ${document.root.title}`,
    "",
    "## Pages",
    ...nodes.map((node) => `- [${node.title}](${paths.get(node.id)})`),
    "",
  ].join("\n");

  const pages = nodes.map((node) => {
    const parent = parentById.get(node.id);
    const lines = [
      `# ${node.title}`,
      "",
      parent ? `Parent: [${parent.title}](${paths.get(parent.id)})` : "Parent: None",
      "",
      "## Notes",
      node.body?.trim() || "_No notes yet._",
      "",
      "## Child Pages",
      ...(node.children.length
        ? node.children.map((child) => `- [${child.title}](${paths.get(child.id)})`)
        : ["_No child pages._"]),
      "",
      "## LLM context",
      `This page represents the mindmap node "${node.title}" from "${document.title}". Use the notes, parent, and child links as structured context for expansion or synthesis.`,
      "",
    ];
    return {
      path: paths.get(node.id)!,
      content: lines.join("\n"),
    };
  });

  return [{ path: "index.md", content: index }, ...pages];
}
