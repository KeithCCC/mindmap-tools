import {
  createMindmapDocument,
  createNode,
  ImportExportResult,
  MindmapDocument,
  MindmapNode,
  touchDocument,
} from "../domain/mindmap";

function unquoteLabel(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return trimmed;
}

function quoteLabel(value: string): string {
  if (/^[A-Za-z0-9 _-]+$/.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function parseMermaidMindmap(source: string): ImportExportResult {
  const warnings: string[] = [];
  const lines = source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line, index) => ({ raw: line, index: index + 1 }))
    .filter(({ raw }) => raw.trim().length > 0);

  const first = lines[0]?.raw.trim().toLowerCase();
  const content = first === "mindmap" ? lines.slice(1) : lines;
  if (first !== "mindmap") warnings.push("Missing Mermaid mindmap header; parsed content as a mindmap body.");

  const document = createMindmapDocument("Imported mindmap");
  const stack: Array<{ depth: number; node: MindmapNode }> = [];
  let root: MindmapNode | undefined;

  for (const { raw, index } of content) {
    const indent = raw.match(/^\s*/)?.[0].length ?? 0;
    const title = unquoteLabel(raw.trim());
    if (!title) continue;
    if (indent % 2 !== 0) warnings.push(`Line ${index} has unsupported indentation; use two spaces per level.`);

    const depth = Math.floor(indent / 2);
    const node = createNode(title);

    if (!root) {
      root = node;
      stack.length = 0;
      stack.push({ depth, node });
      continue;
    }

    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    const parent = stack[stack.length - 1];
    if (!parent) {
      warnings.push(`Line ${index} has no parent; attached to root.`);
      root.children.push(node);
    } else if (depth > parent.depth + 1) {
      warnings.push(`Line ${index} jumps more than one indentation level; attached to nearest parent.`);
      parent.node.children.push(node);
    } else {
      parent.node.children.push(node);
    }
    stack.push({ depth, node });
  }

  const finalRoot = root ?? createNode("Imported mindmap");
  return {
    document: touchDocument(document, finalRoot),
    warnings,
  };
}

function serializeNode(node: MindmapNode, depth: number): string[] {
  return [`${"  ".repeat(depth)}${quoteLabel(node.title)}`, ...node.children.flatMap((child) => serializeNode(child, depth + 1))];
}

export function serializeMermaidMindmap(document: MindmapDocument): string {
  return ["mindmap", ...serializeNode(document.root, 1)].join("\n");
}
