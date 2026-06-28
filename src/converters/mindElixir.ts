import type { MindElixirData, NodeObj } from "mind-elixir";
import { createId, MindmapDocument, MindmapNode, touchDocument } from "../domain/mindmap";

function toNodeObj(node: MindmapNode): NodeObj {
  const style = node.visual?.color
    ? {
        background: node.visual.color,
        color: getReadableTextColor(node.visual.color),
      }
    : undefined;
  return {
    id: node.id,
    topic: node.title,
    note: node.body,
    style,
    expanded: true,
    children: node.children.map(toNodeObj),
  };
}

function getReadableTextColor(background: string): string {
  const hex = background.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "#18212f";
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.58 ? "#18212f" : "#ffffff";
}

function toMindmapNode(node: NodeObj): MindmapNode {
  return {
    id: node.id || createId(),
    title: node.topic?.trim() || "Untitled",
    body: typeof node.note === "string" ? node.note : undefined,
    visual: typeof node.style?.background === "string" ? { color: node.style.background } : undefined,
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
