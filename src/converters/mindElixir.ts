import type { MindElixirData, NodeObj } from "mind-elixir";
import { createId, MindmapDocument, MindmapNode, touchDocument } from "../domain/mindmap";

function toNodeObj(node: MindmapNode): NodeObj {
  return {
    id: node.id,
    topic: node.title,
    note: node.body,
    expanded: true,
    children: node.children.map(toNodeObj),
  };
}

function toMindmapNode(node: NodeObj): MindmapNode {
  return {
    id: node.id || createId(),
    title: node.topic?.trim() || "Untitled",
    body: typeof node.note === "string" ? node.note : undefined,
    children: (node.children ?? []).map(toMindmapNode),
  };
}

export function toMindElixirData(document: MindmapDocument): MindElixirData {
  return {
    nodeData: toNodeObj(document.root),
    direction: 1,
    meta: {
      mindmapToolsDocumentId: document.id,
    },
  };
}

export function fromMindElixirData(data: MindElixirData, previous: MindmapDocument): MindmapDocument {
  const root = toMindmapNode(data.nodeData);
  return touchDocument(previous, root);
}
