import type { GeneratedMindmapNode } from "../../shared/aiMindmap";
import { createNode, type MindmapDocument, type MindmapNode } from "../domain/mindmap";

function toMindmapNode(generated: GeneratedMindmapNode): MindmapNode {
  const node = createNode(generated.title, generated.children.map(toMindmapNode));
  return { ...node, body: generated.body || undefined };
}

export function replaceWithGeneratedMindmap(
  current: MindmapDocument,
  generated: GeneratedMindmapNode,
  now = new Date().toISOString(),
): MindmapDocument {
  const root = toMindmapNode(generated);
  return {
    ...current,
    title: root.title,
    root,
    updatedAt: now,
  };
}
