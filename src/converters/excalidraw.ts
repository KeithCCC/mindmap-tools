import {
  createMindmapDocument,
  createNode,
  flattenNodes,
  ImportExportResult,
  MindmapDocument,
  MindmapNode,
  touchDocument,
} from "../domain/mindmap";

type ExcalidrawElement = {
  id?: string;
  type?: string;
  text?: string;
  x?: number;
  y?: number;
  customData?: Record<string, unknown>;
};

type ExcalidrawFile = {
  type?: string;
  version?: number;
  source?: string;
  elements?: ExcalidrawElement[];
  appState?: {
    mindmapToolsDocument?: MindmapDocument;
    [key: string]: unknown;
  };
  files?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function serializeExcalidrawMindmap(document: MindmapDocument): object {
  const nodes = flattenNodes(document.root);
  const levels = new Map<string, number>();
  const assignLevels = (node: MindmapNode, depth: number) => {
    levels.set(node.id, depth);
    node.children.forEach((child) => assignLevels(child, depth + 1));
  };
  assignLevels(document.root, 0);

  const elements = nodes.map((node, index) => {
    const depth = levels.get(node.id) ?? 0;
    return {
      id: `text-${node.id}`,
      type: "text",
      x: 80 + depth * 220,
      y: 80 + index * 72,
      width: Math.max(120, node.title.length * 9),
      height: 28,
      angle: 0,
      strokeColor: "#1f2937",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 0,
      opacity: 100,
      text: node.title,
      fontSize: depth === 0 ? 28 : 20,
      fontFamily: 1,
      textAlign: "left",
      verticalAlign: "top",
      customData: {
        mindmapToolsNodeId: node.id,
      },
    };
  });

  return {
    type: "excalidraw",
    version: 2,
    source: "mindmap-tools",
    elements,
    appState: {
      viewBackgroundColor: "#ffffff",
      mindmapToolsDocument: document,
    },
    files: {},
  };
}

export function parseExcalidrawMindmap(json: unknown): ImportExportResult {
  const warnings: string[] = [];
  if (!isRecord(json)) {
    return { document: createMindmapDocument("Imported Excalidraw"), warnings: ["Invalid Excalidraw JSON."] };
  }

  const file = json as ExcalidrawFile;
  if (file.appState?.mindmapToolsDocument) {
    return { document: file.appState.mindmapToolsDocument, warnings };
  }

  const textElements = Array.isArray(file.elements)
    ? file.elements.filter((element) => element.type === "text" && typeof element.text === "string")
    : [];

  const document = createMindmapDocument("Imported Excalidraw");
  const sorted = [...textElements].sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0));
  const root = {
    ...document.root,
    children: sorted.map((element) =>
      createNode(String(element.text).trim() || "Untitled"),
    ),
  };

  warnings.push("Imported generic Excalidraw text elements as a best-effort flat mindmap.");
  return {
    document: touchDocument(document, root),
    warnings,
  };
}
