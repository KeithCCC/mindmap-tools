import { useEffect, useMemo, useRef, useState } from "react";
import { strToU8, zipSync } from "fflate";
import {
  appendNode,
  addSibling,
  createNode,
  createMindmapDocument,
  deleteNode,
  findNode,
  flattenNodes,
  MindmapDocument,
  MindmapNode,
  moveNode,
  updateNode,
} from "./domain/mindmap";
import { parseExcalidrawMindmap, serializeExcalidrawMindmap } from "./converters/excalidraw";
import { parseMermaidMindmap, serializeMermaidMindmap } from "./converters/mermaid";
import { generateWikiMarkdown, WikiFile } from "./converters/wiki";
import { MindElixirEditor } from "./components/MindElixirEditor";

const storageKey = "mindmap-tools.document";

type Tab = "edit" | "import" | "export" | "wiki";

function loadDocument(): MindmapDocument {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw) return JSON.parse(raw) as MindmapDocument;
  } catch {
    window.localStorage.removeItem(storageKey);
  }
  return createMindmapDocument("Brainstorm");
}

function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
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
  selectedId,
  onSelect,
}: {
  node: MindmapNode;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <li>
      <button
        className={node.id === selectedId ? "node node-selected" : "node"}
        type="button"
        onClick={() => onSelect(node.id)}
        aria-current={node.id === selectedId ? "true" : undefined}
      >
        {node.title}
      </button>
      {node.children.length > 0 ? (
        <ul>
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} selectedId={selectedId} onSelect={onSelect} />
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

export default function App() {
  const [document, setDocument] = useState<MindmapDocument>(() => loadDocument());
  const [selectedId, setSelectedId] = useState(document.root.id);
  const [activeTab, setActiveTab] = useState<Tab>("edit");
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [inlineEditRequest, setInlineEditRequest] = useState(0);
  const [mermaidInput, setMermaidInput] = useState("mindmap\n  Brainstorm\n    Audience\n    Product\n    Distribution");
  const [warnings, setWarnings] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dataFileInputRef = useRef<HTMLInputElement>(null);

  const selectedNode = findNode(document.root, selectedId) ?? document.root;
  const mermaidOutput = useMemo(() => serializeMermaidMindmap(document), [document]);
  const dataOutput = useMemo(() => JSON.stringify(document, null, 2), [document]);
  const excalidrawOutput = useMemo(() => JSON.stringify(serializeExcalidrawMindmap(document), null, 2), [document]);
  const wikiFiles = useMemo(() => generateWikiMarkdown(document), [document]);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(document));
  }, [document]);

  useEffect(() => {
    if (!findNode(document.root, selectedId)) setSelectedId(document.root.id);
  }, [document, selectedId]);

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
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        const result = addSibling(document, selectedId, "New idea");
        setDocument(result.document);
        setSelectedId(result.node.id);
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedId !== document.root.id) {
          event.preventDefault();
          setDocument((current) => deleteNode(current, selectedId));
          setSelectedId(document.root.id);
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

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="label">Mindmap Tools</p>
          <h1>{document.root.title}</h1>
        </div>
        <div className="header-actions">
          <button type="button" onClick={() => downloadBlob("mindmap-tools.json", new Blob([dataOutput], { type: "application/json" }))}>
            Save Data
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
            Load Data
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
            document={document}
            selectedNodeId={selectedId}
            inlineEditRequest={inlineEditRequest}
            onDocumentChange={setDocument}
            onSelectedNodeChange={setSelectedId}
          />
          <details className="outline-panel" aria-label="Mindmap tree">
            <summary className="outline-title">Semantic outline</summary>
            <ul className="tree">
              <TreeNode node={document.root} selectedId={selectedId} onSelect={setSelectedId} />
            </ul>
          </details>
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
                  }}
                >
                  Add child
                </button>
                <button
                  type="button"
                  disabled={selectedNode.id === document.root.id}
                  onClick={() => setDocument((current) => deleteNode(current, selectedNode.id))}
                >
                  Delete node
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
