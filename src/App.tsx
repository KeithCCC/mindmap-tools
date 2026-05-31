import { useEffect, useMemo, useRef, useState } from "react";
import { strToU8, zipSync } from "fflate";
import {
  appendNode,
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
  const [mermaidInput, setMermaidInput] = useState("mindmap\n  Brainstorm\n    Audience\n    Product\n    Distribution");
  const [warnings, setWarnings] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedNode = findNode(document.root, selectedId) ?? document.root;
  const mermaidOutput = useMemo(() => serializeMermaidMindmap(document), [document]);
  const excalidrawOutput = useMemo(() => JSON.stringify(serializeExcalidrawMindmap(document), null, 2), [document]);
  const wikiFiles = useMemo(() => generateWikiMarkdown(document), [document]);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(document));
  }, [document]);

  useEffect(() => {
    if (!findNode(document.root, selectedId)) setSelectedId(document.root.id);
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
    const content = await file.text();
    const result = parseExcalidrawMindmap(JSON.parse(content));
    setDocument(result.document);
    setSelectedId(result.document.root.id);
    setWarnings(result.warnings);
  };

  const allNodes = flattenNodes(document.root);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="label">Mindmap Tools</p>
          <h1>Idea workspace</h1>
        </div>
        <div className="header-actions">
          <button type="button" onClick={() => downloadBlob("mindmap.mmd", new Blob([mermaidOutput], { type: "text/plain" }))}>
            Export Mermaid
          </button>
          <button type="button" onClick={() => downloadBlob("llm-wiki.zip", createWikiZip(wikiFiles))}>
            Export Wiki
          </button>
        </div>
      </header>

      <section className="workspace">
        <div className="canvas-panel" aria-label="Mindmap tree">
          <div className="panel-heading">
            <h2>{document.root.title}</h2>
            <span>{allNodes.length} nodes</span>
          </div>
          <ul className="tree">
            <TreeNode node={document.root} selectedId={selectedId} onSelect={setSelectedId} />
          </ul>
        </div>

        <aside className="side-panel">
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
