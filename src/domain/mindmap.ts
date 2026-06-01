export interface MindmapNode {
  id: string;
  title: string;
  body?: string;
  children: MindmapNode[];
  visual?: {
    x?: number;
    y?: number;
    color?: string;
  };
}

export interface MindmapDocument {
  id: string;
  title: string;
  root: MindmapNode;
  createdAt: string;
  updatedAt: string;
}

export interface ImportExportResult {
  document: MindmapDocument;
  warnings: string[];
}

let idCounter = 0;

export function createId(prefix = "node"): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

export function createNode(title: string, children: MindmapNode[] = []): MindmapNode {
  return {
    id: createId(),
    title: title.trim() || "Untitled",
    children,
  };
}

export function createMindmapDocument(title = "New mindmap"): MindmapDocument {
  const now = new Date().toISOString();
  return {
    id: createId("doc"),
    title,
    root: createNode(title),
    createdAt: now,
    updatedAt: now,
  };
}

export function touchDocument(document: MindmapDocument, root: MindmapNode): MindmapDocument {
  return {
    ...document,
    title: root.title,
    root,
    updatedAt: new Date().toISOString(),
  };
}

export function findNode(node: MindmapNode, id: string): MindmapNode | undefined {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return undefined;
}

export function hasDescendant(node: MindmapNode, id: string): boolean {
  return node.children.some((child) => child.id === id || hasDescendant(child, id));
}

function mapNode(node: MindmapNode, id: string, mapper: (node: MindmapNode) => MindmapNode): MindmapNode {
  if (node.id === id) return mapper(node);
  return {
    ...node,
    children: node.children.map((child) => mapNode(child, id, mapper)),
  };
}

export function addNode(document: MindmapDocument, parentId: string, title = "New idea"): MindmapDocument {
  return appendNode(document, parentId, createNode(title));
}

export function addSibling(document: MindmapDocument, nodeId: string, title = "New idea"): { document: MindmapDocument; node: MindmapNode } {
  if (document.root.id === nodeId) {
    const node = createNode(title);
    return { document: appendNode(document, document.root.id, node), node };
  }

  const sibling = createNode(title);
  const insert = (node: MindmapNode): MindmapNode => {
    const index = node.children.findIndex((child) => child.id === nodeId);
    if (index >= 0) {
      return {
        ...node,
        children: [...node.children.slice(0, index + 1), sibling, ...node.children.slice(index + 1)],
      };
    }
    return {
      ...node,
      children: node.children.map(insert),
    };
  };

  return { document: touchDocument(document, insert(document.root)), node: sibling };
}

export function appendNode(document: MindmapDocument, parentId: string, child: MindmapNode): MindmapDocument {
  const root = mapNode(document.root, parentId, (node) => ({
    ...node,
    children: [...node.children, child],
  }));
  return touchDocument(document, root);
}

export function updateNode(
  document: MindmapDocument,
  nodeId: string,
  updates: Partial<Pick<MindmapNode, "title" | "body" | "visual">>,
): MindmapDocument {
  const root = mapNode(document.root, nodeId, (node) => ({
    ...node,
    ...updates,
    title: updates.title !== undefined ? updates.title : node.title,
  }));
  return touchDocument(document, root);
}

function removeNode(node: MindmapNode, id: string): { node: MindmapNode; removed?: MindmapNode } {
  let removed: MindmapNode | undefined;
  const children = node.children
    .map((child) => {
      if (child.id === id) {
        removed = child;
        return undefined;
      }
      const result = removeNode(child, id);
      if (result.removed) removed = result.removed;
      return result.node;
    })
    .filter((child): child is MindmapNode => Boolean(child));
  return { node: { ...node, children }, removed };
}

export function deleteNode(document: MindmapDocument, nodeId: string): MindmapDocument {
  if (document.root.id === nodeId) return document;
  const result = removeNode(document.root, nodeId);
  return touchDocument(document, result.node);
}

export function moveNode(document: MindmapDocument, nodeId: string, newParentId: string): MindmapDocument {
  if (nodeId === document.root.id) throw new Error("Cannot move the root node");
  const moving = findNode(document.root, nodeId);
  const newParent = findNode(document.root, newParentId);
  if (!moving || !newParent) throw new Error("Node not found");
  if (moving.id === newParent.id || hasDescendant(moving, newParent.id)) {
    throw new Error("Cannot move a node into its own descendant");
  }

  const removed = removeNode(document.root, nodeId);
  if (!removed.removed) throw new Error("Node not found");

  const root = mapNode(removed.node, newParentId, (node) => ({
    ...node,
    children: [...node.children, removed.removed!],
  }));
  return touchDocument(document, root);
}

export function validateTree(document: MindmapDocument): string[] {
  const seen = new Set<string>();
  const warnings: string[] = [];

  function visit(node: MindmapNode, path: string[]) {
    if (seen.has(node.id)) warnings.push(`Duplicate node id: ${node.id}`);
    seen.add(node.id);
    if (!node.title.trim()) warnings.push(`Empty title at ${path.join(" > ") || "root"}`);
    node.children.forEach((child) => visit(child, [...path, node.title]));
  }

  visit(document.root, []);
  return warnings;
}

export function flattenNodes(root: MindmapNode): MindmapNode[] {
  return [root, ...root.children.flatMap(flattenNodes)];
}
