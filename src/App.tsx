import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { strToU8, zipSync } from "fflate";
import {
  appendNode,
  addSibling,
  createNode,
  createMindmapDocument,
  deleteNode,
  findNode,
  findParentNode,
  flattenNodes,
  insertIntermediateNode,
  MindmapDocument,
  MindmapNode,
  moveNode,
  renameMindmapDocument,
  reorderNode,
  updateNode,
} from "./domain/mindmap";
import { parseExcalidrawMindmap, serializeExcalidrawMindmap } from "./converters/excalidraw";
import { parseMermaidMindmap, serializeMermaidMindmap } from "./converters/mermaid";
import { generateWikiMarkdown, WikiFile } from "./converters/wiki";
import { MindElixirEditor } from "./components/MindElixirEditor";

const storageKey = "mindmap-tools.document";
const themeStorageKey = "mindmap-tools.theme";

type Tab = "edit" | "cloud" | "import" | "export" | "wiki";
type DropPosition = "before" | "after" | "inside";
type OutlineDropTarget = { id: string; position: DropPosition } | null;

type CloudMindmapSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

type FileSaveHandle = {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

declare global {
  interface Window {
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: Array<{
        description: string;
        accept: Record<string, string[]>;
      }>;
    }) => Promise<FileSaveHandle>;
  }
}

function loadDocument(): MindmapDocument {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw) return JSON.parse(raw) as MindmapDocument;
  } catch {
    window.localStorage.removeItem(storageKey);
  }
  return createMindmapDocument("Brainstorm");
}

function loadTheme(): "light" | "dark" {
  return window.localStorage.getItem(themeStorageKey) === "dark" ? "dark" : "light";
}

function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slugifyFileName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "mindmap";
}

function readFileText(file: File): Promise<string> {
  if ("text" in file && typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function isMindmapNode(value: unknown): value is MindmapNode {
  if (typeof value !== "object" || value === null) return false;
  const node = value as Partial<MindmapNode>;
  return (
    typeof node.id === "string" &&
    typeof node.title === "string" &&
    Array.isArray(node.children) &&
    node.children.every(isMindmapNode)
  );
}

function isMindmapDocument(value: unknown): value is MindmapDocument {
  if (typeof value !== "object" || value === null) return false;
  const document = value as Partial<MindmapDocument>;
  return (
    typeof document.id === "string" &&
    typeof document.title === "string" &&
    typeof document.createdAt === "string" &&
    typeof document.updatedAt === "string" &&
    isMindmapNode(document.root)
  );
}

function TreeNode({
  node,
  rootId,
  siblingIndex,
  siblingCount,
  selectedId,
  dropTarget,
  collapsedIds,
  onSelect,
  onToggleCollapse,
  onMoveNode,
  onDragOverNode,
  onDropNode,
  onDragEnd,
}: {
  node: MindmapNode;
  rootId: string;
  siblingIndex?: number;
  siblingCount?: number;
  selectedId: string;
  dropTarget: OutlineDropTarget;
  collapsedIds: Set<string>;
  onSelect: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onMoveNode: (id: string, direction: "up" | "down") => void;
  onDragOverNode: (id: string, position: DropPosition) => void;
  onDropNode: (draggedId: string, targetId: string, position: DropPosition) => void;
  onDragEnd: () => void;
}) {
  const getDropPosition = (event: DragEvent<HTMLButtonElement>): DropPosition => {
    if (node.id === rootId) return "inside";
    const rect = event.currentTarget.getBoundingClientRect();
    const offset = event.clientY - rect.top;
    if (offset < rect.height * 0.33) return "before";
    if (offset > rect.height * 0.67) return "after";
    return "inside";
  };
  const canDrag = node.id !== rootId;
  const dropClass =
    dropTarget?.id === node.id
      ? dropTarget.position === "before"
        ? "node-drop-before"
        : dropTarget.position === "after"
          ? "node-drop-after"
          : "node-drop-inside"
      : "";
  const isCollapsed = collapsedIds.has(node.id);
  const hasChildren = node.children.length > 0;
  const canMoveUp = canDrag && siblingIndex !== undefined && siblingIndex > 0;
  const canMoveDown = canDrag && siblingIndex !== undefined && siblingCount !== undefined && siblingIndex < siblingCount - 1;

  return (
    <li>
      <div className="tree-node-row">
        <button
          type="button"
          className="tree-toggle"
          disabled={!hasChildren}
          aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${node.title}`}
          onClick={() => onToggleCollapse(node.id)}
        >
          {hasChildren ? (isCollapsed ? "+" : "-") : ""}
        </button>
        <button
          className={`${node.id === selectedId ? "node node-selected" : "node"} ${dropClass}`.trim()}
          type="button"
          draggable={canDrag}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("application/x-mindmap-node", node.id);
            event.dataTransfer.setData("text/plain", node.id);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            onDragOverNode(node.id, getDropPosition(event));
          }}
          onDrop={(event) => {
            event.preventDefault();
            const draggedId = event.dataTransfer.getData("application/x-mindmap-node") || event.dataTransfer.getData("text/plain");
            if (draggedId) onDropNode(draggedId, node.id, getDropPosition(event));
          }}
          onDragEnd={onDragEnd}
          onClick={() => onSelect(node.id)}
          aria-current={node.id === selectedId ? "true" : undefined}
        >
          {node.title}
        </button>
        {canDrag ? (
          <div className="node-order-controls" aria-label={`Order ${node.title}`}>
            <button type="button" disabled={!canMoveUp} onClick={() => onMoveNode(node.id, "up")} aria-label={`Move ${node.title} up`}>
              Up
            </button>
            <button type="button" disabled={!canMoveDown} onClick={() => onMoveNode(node.id, "down")} aria-label={`Move ${node.title} down`}>
              Down
            </button>
          </div>
        ) : null}
      </div>
      {hasChildren && !isCollapsed ? (
        <ul>
          {node.children.map((child, index) => (
            <TreeNode
              key={child.id}
              node={child}
              rootId={rootId}
              siblingIndex={index}
              siblingCount={node.children.length}
              selectedId={selectedId}
              dropTarget={dropTarget}
              collapsedIds={collapsedIds}
              onSelect={onSelect}
              onToggleCollapse={onToggleCollapse}
              onMoveNode={onMoveNode}
              onDragOverNode={onDragOverNode}
              onDropNode={onDropNode}
              onDragEnd={onDragEnd}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function createWikiZip(files: WikiFile[]): Blob {
  const entries = Object.fromEntries(files.map((file) => [file.path, strToU8(file.content)]));
  return new Blob([zipSync(entries)], { type: "application/zip" });
}

async function readApiJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Request failed with status ${response.status}`);
  return payload;
}

export default function App() {
  const [document, setDocument] = useState<MindmapDocument>(() => loadDocument());
  const [theme, setTheme] = useState<"light" | "dark">(() => loadTheme());
  const [selectedId, setSelectedId] = useState(document.root.id);
  const [activeTab, setActiveTab] = useState<Tab>("edit");
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [noteEditorNodeId, setNoteEditorNodeId] = useState<string | null>(null);
  const [inlineEditRequest, setInlineEditRequest] = useState(0);
  const [mermaidInput, setMermaidInput] = useState("mindmap\n  Brainstorm\n    Audience\n    Product\n    Distribution");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [cloudMindmaps, setCloudMindmaps] = useState<CloudMindmapSummary[]>([]);
  const [cloudStatus, setCloudStatus] = useState("Cloud storage not checked yet.");
  const [isCloudLoading, setIsCloudLoading] = useState(false);
  const [localFileStatus, setLocalFileStatus] = useState("Local JSON export is ready.");
  const [outlineDropTarget, setOutlineDropTarget] = useState<OutlineDropTarget>(null);
  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [collapsedOutlineIds, setCollapsedOutlineIds] = useState<Set<string>>(() => new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dataFileInputRef = useRef<HTMLInputElement>(null);
  const noteEditorRef = useRef<HTMLTextAreaElement>(null);

  const selectedNode = findNode(document.root, selectedId) ?? document.root;
  const noteEditorNode = noteEditorNodeId ? findNode(document.root, noteEditorNodeId) : undefined;
  const mermaidOutput = useMemo(() => serializeMermaidMindmap(document), [document]);
  const dataOutput = useMemo(() => JSON.stringify(document, null, 2), [document]);
  const excalidrawOutput = useMemo(() => JSON.stringify(serializeExcalidrawMindmap(document), null, 2), [document]);
  const wikiFiles = useMemo(() => generateWikiMarkdown(document), [document]);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(document));
  }, [document]);

  useEffect(() => {
    window.localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  useEffect(() => {
    if (!findNode(document.root, selectedId)) setSelectedId(document.root.id);
  }, [document, selectedId]);

  useEffect(() => {
    if (noteEditorNodeId && !findNode(document.root, noteEditorNodeId)) setNoteEditorNodeId(null);
  }, [document, noteEditorNodeId]);

  useEffect(() => {
    if (!noteEditorNodeId) return;
    window.setTimeout(() => {
      const textarea = noteEditorRef.current;
      if (!textarea) return;
      const end = textarea.value.length;
      textarea.focus();
      textarea.setSelectionRange(end, end);
    }, 0);
  }, [noteEditorNodeId]);

  useEffect(() => {
    const isFormField = (target: EventTarget | null) =>
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable);

    const selectRelative = (direction: "parent" | "child" | "previous" | "next") => {
      const path: MindmapNode[] = [];
      const findPath = (node: MindmapNode): boolean => {
        path.push(node);
        if (node.id === selectedId) return true;
        for (const child of node.children) {
          if (findPath(child)) return true;
        }
        path.pop();
        return false;
      };
      if (!findPath(document.root)) return;
      const selected = path[path.length - 1];
      const parent = path[path.length - 2];
      if (direction === "parent" && parent) setSelectedId(parent.id);
      if (direction === "child" && selected.children[0]) setSelectedId(selected.children[0].id);
      if ((direction === "previous" || direction === "next") && parent) {
        const index = parent.children.findIndex((child) => child.id === selected.id);
        const nextIndex = direction === "previous" ? index - 1 : index + 1;
        const sibling = parent.children[nextIndex];
        if (sibling) setSelectedId(sibling.id);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isFormField(event.target)) return;
      if (event.key === "F2") {
        event.preventDefault();
        setInlineEditRequest((count) => count + 1);
      }
      if (event.key === "Tab") {
        event.preventDefault();
        const child = createNode("New idea");
        setDocument((current) => appendNode(current, selectedId, child));
        setSelectedId(child.id);
        setInlineEditRequest((count) => count + 1);
      }
      if (event.key === "Enter" && event.ctrlKey) {
        event.preventDefault();
        const result = insertIntermediateNode(document, selectedId, "New idea");
        setDocument(result.document);
        setSelectedId(result.node.id);
        setInlineEditRequest((count) => count + 1);
      } else if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        const result = addSibling(document, selectedId, "New idea");
        setDocument(result.document);
        setSelectedId(result.node.id);
        setInlineEditRequest((count) => count + 1);
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedId !== document.root.id) {
          event.preventDefault();
          const parent = findParentNode(document.root, selectedId) ?? document.root;
          setDocument((current) => deleteNode(current, selectedId));
          setSelectedId(parent.id);
        }
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        selectRelative("previous");
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        selectRelative("next");
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        selectRelative("parent");
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        selectRelative("child");
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [document, selectedId]);

  const updateSelected = (updates: Partial<Pick<MindmapNode, "title" | "body">>) => {
    setDocument((current) => updateNode(current, selectedNode.id, updates));
  };

  const deleteSelectedNode = () => {
    if (selectedNode.id === document.root.id) return;
    const parent = findParentNode(document.root, selectedNode.id) ?? document.root;
    setDocument((current) => deleteNode(current, selectedNode.id));
    setSelectedId(parent.id);
  };

  const moveSelectedNodeToRoot = () => {
    if (selectedNode.id === document.root.id) return;
    setDocument((current) => moveNode(current, selectedNode.id, current.root.id));
    setSelectedId(selectedNode.id);
  };

  const dropOutlineNode = (draggedId: string, targetId: string, position: DropPosition) => {
    setOutlineDropTarget(null);
    if (draggedId === targetId || draggedId === document.root.id) return;
    try {
      setDocument((current) => (position === "inside" ? moveNode(current, draggedId, targetId) : reorderNode(current, draggedId, targetId, position)));
      setSelectedId(draggedId);
    } catch (error) {
      setWarnings([error instanceof Error ? error.message : String(error)]);
    }
  };

  const moveOutlineNode = (nodeId: string, direction: "up" | "down") => {
    if (nodeId === document.root.id) return;
    try {
      setDocument((current) => {
        const parent = findParentNode(current.root, nodeId);
        if (!parent) return current;
        const index = parent.children.findIndex((child) => child.id === nodeId);
        const target = parent.children[direction === "up" ? index - 1 : index + 1];
        if (!target) return current;
        return reorderNode(current, nodeId, target.id, direction === "up" ? "before" : "after");
      });
      setSelectedId(nodeId);
    } catch (error) {
      setWarnings([error instanceof Error ? error.message : String(error)]);
    }
  };

  // Neon cloud storage is implemented for future work, but hidden from the UI while local JSON file management is the primary workflow.
  const refreshCloudMindmaps = async () => {
    setIsCloudLoading(true);
    setCloudStatus("Loading cloud mindmaps...");
    try {
      const payload = await readApiJson<{ mindmaps: CloudMindmapSummary[] }>(await fetch("/api/mindmaps"));
      setCloudMindmaps(payload.mindmaps);
      setCloudStatus(payload.mindmaps.length ? `Loaded ${payload.mindmaps.length} cloud mindmap(s).` : "No cloud mindmaps saved yet.");
    } catch (error) {
      setCloudStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCloudLoading(false);
    }
  };

  const saveToCloud = async () => {
    setActiveTab("cloud");
    setIsCloudLoading(true);
    setCloudStatus("Saving current mindmap to Neon...");
    try {
      await readApiJson<{ document: MindmapDocument }>(
        await fetch("/api/mindmaps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document }),
        }),
      );
      setCloudStatus(`Saved "${document.title}" to Neon.`);
      await refreshCloudMindmaps();
    } catch (error) {
      setCloudStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCloudLoading(false);
    }
  };

  const loadFromCloud = async (id: string) => {
    setIsCloudLoading(true);
    setCloudStatus("Loading mindmap from Neon...");
    try {
      const payload = await readApiJson<{ document: MindmapDocument }>(await fetch(`/api/mindmaps/${encodeURIComponent(id)}`));
      setDocument(payload.document);
      setSelectedId(payload.document.root.id);
      setCloudStatus(`Loaded "${payload.document.title}" from Neon.`);
      setActiveTab("edit");
    } catch (error) {
      setCloudStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCloudLoading(false);
    }
  };

  const deleteFromCloud = async (id: string) => {
    setIsCloudLoading(true);
    setCloudStatus("Deleting cloud mindmap...");
    try {
      const response = await fetch(`/api/mindmaps/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(`Delete failed with status ${response.status}`);
      setCloudStatus("Deleted cloud mindmap.");
      await refreshCloudMindmaps();
    } catch (error) {
      setCloudStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCloudLoading(false);
    }
  };

  const downloadJson = () => {
    const fileName = `${slugifyFileName(document.title)}.json`;
    downloadBlob(fileName, new Blob([dataOutput], { type: "application/json" }));
    setActiveTab("export");
    setLocalFileStatus(`Requested download: ${fileName}. If no file appears, use Copy JSON or open the app in Chrome/Edge.`);
  };

  const saveJsonFile = async () => {
    const fileName = `${slugifyFileName(document.title)}.json`;
    const blob = new Blob([dataOutput], { type: "application/json" });
    if (!window.showSaveFilePicker) {
      downloadBlob(fileName, blob);
      setLocalFileStatus(`Requested download: ${fileName}. If no file appears, use Copy JSON or open the app in Chrome/Edge.`);
      return;
    }

    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: "Mindmap JSON",
            accept: { "application/json": [".json"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      setLocalFileStatus(`Saved JSON file: ${fileName}`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setLocalFileStatus("Save canceled.");
      } else {
        setLocalFileStatus("Save file was blocked by the browser. Use Copy JSON instead.");
      }
    }
  };

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(dataOutput);
      setLocalFileStatus("Copied current mindmap JSON to clipboard.");
    } catch {
      setLocalFileStatus("Clipboard copy was blocked by the browser.");
    }
  };

  const importMermaid = () => {
    const result = parseMermaidMindmap(mermaidInput);
    setDocument(result.document);
    setSelectedId(result.document.root.id);
    setWarnings(result.warnings);
  };

  const importExcalidrawFile = async (file: File) => {
    const content = await readFileText(file);
    const result = parseExcalidrawMindmap(JSON.parse(content));
    setDocument(result.document);
    setSelectedId(result.document.root.id);
    setWarnings(result.warnings);
  };

  const loadDataFile = async (file: File) => {
    const content = await readFileText(file);
    const parsed = JSON.parse(content) as unknown;
    if (!isMindmapDocument(parsed)) {
      setWarnings(["Invalid mindmap data file."]);
      setActiveTab("import");
      return;
    }
    setDocument(parsed);
    setSelectedId(parsed.root.id);
    setWarnings([]);
  };

  const resetData = () => {
    const nextDocument = createMindmapDocument("Brainstorm");
    setDocument(nextDocument);
    setSelectedId(nextDocument.root.id);
    setWarnings([]);
    setActiveTab("edit");
  };

  const allNodes = flattenNodes(document.root);

  const toggleOutlineCollapse = (id: string) => {
    setCollapsedOutlineIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const collapseAllOutlineNodes = () => {
    setCollapsedOutlineIds(new Set(allNodes.filter((node) => node.children.length > 0).map((node) => node.id)));
  };

  return (
    <main className={`app-shell theme-${theme}`}>
      <header className="app-header">
        <div>
          <p className="label">Mindmap Tools</p>
          <h1>{document.root.title}</h1>
        </div>
        <div className="header-actions">
          <button type="button" aria-pressed={theme === "dark"} onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}>
            {theme === "dark" ? "Light theme" : "Dark theme"}
          </button>
          <button type="button" onClick={downloadJson}>
            Download JSON
          </button>
          <input
            ref={dataFileInputRef}
            type="file"
            accept=".json,application/json"
            aria-label="Load mindmap data file"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void loadDataFile(file);
              event.currentTarget.value = "";
            }}
          />
          <button type="button" onClick={() => dataFileInputRef.current?.click()}>
            Load JSON
          </button>
          <button type="button" onClick={resetData}>
            Reset Data
          </button>
          <button type="button" onClick={() => downloadBlob("mindmap.mmd", new Blob([mermaidOutput], { type: "text/plain" }))}>
            Export Mermaid
          </button>
          <button
            type="button"
            onClick={() => downloadBlob("mindmap.excalidraw", new Blob([excalidrawOutput], { type: "application/json" }))}
          >
            Export Excalidraw
          </button>
          <button type="button" onClick={() => downloadBlob("llm-wiki.zip", createWikiZip(wikiFiles))}>
            Export Wiki
          </button>
        </div>
      </header>

      <section className={isInspectorOpen ? "workspace" : "workspace inspector-collapsed"}>
        <div className="canvas-panel">
          <div className="panel-heading">
            <h2>Brainstorm editor</h2>
            <div className="panel-actions">
              <span>{allNodes.length} nodes</span>
              <button type="button" className="inspector-toggle" onClick={() => setIsOutlineOpen(true)}>
                Open outline
              </button>
              <button
                type="button"
                className="inspector-toggle"
                aria-expanded={isInspectorOpen}
                aria-controls="property-inspector"
                onClick={() => setIsInspectorOpen((open) => !open)}
              >
                {isInspectorOpen ? "Hide properties" : "Show properties"}
              </button>
            </div>
          </div>
          <MindElixirEditor
            key={theme}
            document={document}
            selectedNodeId={selectedId}
            inlineEditRequest={inlineEditRequest}
            theme={theme}
            showNoteEditorInContextMenu={!isInspectorOpen}
            onDocumentChange={setDocument}
            onSelectedNodeChange={setSelectedId}
            onEditNodeNotes={setNoteEditorNodeId}
          />
          {isOutlineOpen ? (
            <div className="outline-backdrop" role="presentation" onMouseDown={() => setIsOutlineOpen(false)}>
              <section className="outline-dialog" role="dialog" aria-modal="true" aria-label="Semantic outline" onMouseDown={(event) => event.stopPropagation()}>
                <div className="outline-dialog-header">
                  <div>
                    <p className="label">Semantic outline</p>
                    <h2>Tree order</h2>
                  </div>
                  <div className="outline-actions">
                    <button type="button" onClick={collapseAllOutlineNodes}>
                      Collapse all
                    </button>
                    <button type="button" onClick={() => setCollapsedOutlineIds(new Set())}>
                      Expand all
                    </button>
                    <button type="button" onClick={() => setIsOutlineOpen(false)}>
                      Close
                    </button>
                  </div>
                </div>
                <p className="outline-help">Use Up/Down to sort siblings. Drag onto the top or bottom of a node to sort, or drop in the middle to move under that node.</p>
                <div className="outline-scroll">
                  <ul className="tree">
                    <TreeNode
                      node={document.root}
                      rootId={document.root.id}
                      selectedId={selectedId}
                      dropTarget={outlineDropTarget}
                      collapsedIds={collapsedOutlineIds}
                      onSelect={setSelectedId}
                      onToggleCollapse={toggleOutlineCollapse}
                      onMoveNode={moveOutlineNode}
                      onDragOverNode={(id, position) => setOutlineDropTarget({ id, position })}
                      onDropNode={dropOutlineNode}
                      onDragEnd={() => setOutlineDropTarget(null)}
                    />
                  </ul>
                </div>
              </section>
            </div>
          ) : null}
          {noteEditorNode ? (
            <div className="note-editor-backdrop" role="presentation" onMouseDown={() => setNoteEditorNodeId(null)}>
              <section
                className="note-editor-dialog"
                role="dialog"
                aria-modal="true"
                aria-label={`Edit notes for ${noteEditorNode.title}`}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="note-editor-header">
                  <div>
                    <p className="label">Node properties</p>
                    <h2>{noteEditorNode.title}</h2>
                  </div>
                  <button type="button" onClick={() => setNoteEditorNodeId(null)}>
                    Close
                  </button>
                </div>
                <label>
                  Notes
                  <textarea
                    ref={noteEditorRef}
                    aria-label="Popup notes"
                    value={noteEditorNode.body ?? ""}
                    rows={16}
                    onChange={(event) => setDocument((current) => updateNode(current, noteEditorNode.id, { body: event.target.value }))}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setNoteEditorNodeId(null);
                      }
                    }}
                  />
                </label>
              </section>
            </div>
          ) : null}
        </div>

        <aside id="property-inspector" className="side-panel" hidden={!isInspectorOpen}>
          <div className="tabs" role="tablist" aria-label="Mindmap tools">
            {(["edit", "import", "export", "wiki"] as Tab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                className={activeTab === tab ? "tab-active" : ""}
                onClick={() => setActiveTab(tab)}
              >
                {tab[0].toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {activeTab === "edit" ? (
            <section className="tool-section">
              <label>
                Map file name
                <input
                  value={document.title}
                  onChange={(event) => setDocument((current) => renameMindmapDocument(current, event.target.value))}
                />
              </label>
              <label>
                Selected node title
                <input value={selectedNode.title} onChange={(event) => updateSelected({ title: event.target.value })} />
              </label>
              <label>
                Notes
                <textarea
                  value={selectedNode.body ?? ""}
                  onChange={(event) => updateSelected({ body: event.target.value })}
                  rows={7}
                />
              </label>
              <div className="button-grid">
                <button
                  type="button"
                  onClick={() => {
                    const child = createNode("New idea");
                    setDocument((current) => appendNode(current, selectedNode.id, child));
                    setSelectedId(child.id);
                    setInlineEditRequest((count) => count + 1);
                  }}
                >
                  Add child
                </button>
                <button
                  type="button"
                  disabled={selectedNode.id === document.root.id}
                  onClick={deleteSelectedNode}
                >
                  Delete node
                </button>
                <button
                  type="button"
                  disabled={selectedNode.id === document.root.id || findParentNode(document.root, selectedNode.id)?.id === document.root.id}
                  onClick={moveSelectedNodeToRoot}
                >
                  Move to root
                </button>
              </div>
              <label>
                Move selected under
                <select
                  value=""
                  onChange={(event) => {
                    if (event.target.value) setDocument((current) => moveNode(current, selectedNode.id, event.target.value));
                  }}
                  disabled={selectedNode.id === document.root.id}
                >
                  <option value="">Choose parent</option>
                  {allNodes
                    .filter((node) => node.id !== selectedNode.id)
                    .map((node) => (
                      <option key={node.id} value={node.id}>
                        {node.title}
                      </option>
                    ))}
                </select>
              </label>
            </section>
          ) : null}

          {activeTab === "cloud" ? (
            <section className="tool-section">
              <div className="button-grid">
                <button type="button" disabled={isCloudLoading} onClick={saveToCloud}>
                  Save to Neon
                </button>
                <button type="button" disabled={isCloudLoading} onClick={refreshCloudMindmaps}>
                  Refresh Cloud
                </button>
              </div>
              <div className="warnings" role="status">
                <p>{cloudStatus}</p>
              </div>
              <div className="cloud-list" aria-label="Cloud mindmaps">
                {cloudMindmaps.map((mindmap) => (
                  <article className="cloud-item" key={mindmap.id}>
                    <div>
                      <strong>{mindmap.title}</strong>
                      <span>{new Date(mindmap.updatedAt).toLocaleString()}</span>
                    </div>
                    <div className="cloud-actions">
                      <button type="button" disabled={isCloudLoading} onClick={() => void loadFromCloud(mindmap.id)}>
                        Load
                      </button>
                      <button type="button" disabled={isCloudLoading} onClick={() => void deleteFromCloud(mindmap.id)}>
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {activeTab === "import" ? (
            <section className="tool-section">
              <label>
                Mermaid mindmap input
                <textarea value={mermaidInput} onChange={(event) => setMermaidInput(event.target.value)} rows={9} />
              </label>
              <button type="button" onClick={importMermaid}>
                Import Mermaid
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importExcalidrawFile(file);
                }}
              />
              <button type="button" onClick={() => fileInputRef.current?.click()}>
                Import Excalidraw JSON
              </button>
              {warnings.length > 0 ? (
                <div className="warnings" role="status">
                  {warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {activeTab === "export" ? (
            <section className="tool-section">
              <label>
                Mindmap JSON
                <textarea readOnly value={dataOutput} rows={8} />
              </label>
            <div className="button-grid">
              <button type="button" onClick={() => void saveJsonFile()}>
                Save JSON File
              </button>
              <button type="button" onClick={downloadJson}>
                Download JSON
              </button>
              <button type="button" onClick={() => void copyJson()}>
                  Copy JSON
                </button>
              </div>
              <div className="warnings" role="status">
                <p>{localFileStatus}</p>
              </div>
              <label>
                Mermaid
                <textarea readOnly value={mermaidOutput} rows={8} />
              </label>
              <button type="button" onClick={() => downloadBlob("mindmap.mmd", new Blob([mermaidOutput], { type: "text/plain" }))}>
                Download Mermaid
              </button>
              <label>
                Excalidraw JSON
                <textarea readOnly value={excalidrawOutput} rows={8} />
              </label>
              <button
                type="button"
                onClick={() => downloadBlob("mindmap.excalidraw", new Blob([excalidrawOutput], { type: "application/json" }))}
              >
                Download Excalidraw JSON
              </button>
            </section>
          ) : null}

          {activeTab === "wiki" ? (
            <section className="tool-section">
              <div className="wiki-list">
                {wikiFiles.map((file) => (
                  <details key={file.path} open={file.path === "index.md"}>
                    <summary>{file.path}</summary>
                    <pre>{file.content}</pre>
                  </details>
                ))}
              </div>
              <button type="button" onClick={() => downloadBlob("llm-wiki.zip", createWikiZip(wikiFiles))}>
                Download wiki zip
              </button>
            </section>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
