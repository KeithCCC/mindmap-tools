import MindElixir, { type MindElixirInstance } from "mind-elixir";
import { useEffect, useRef, useState } from "react";
import { findNode, MindmapDocument, MindmapNode, moveNode, updateNode } from "../domain/mindmap";
import { fromMindElixirData, toMindElixirData } from "../converters/mindElixir";

type InlineEditState = {
  id: string;
  value: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

type ColorMenuState = {
  id: string;
  left: number;
  top: number;
};

const nodeColors = ["#ffffff", "#e7f0ff", "#dcfce7", "#fef3c7", "#fee2e2", "#ede9fe", "#cffafe", "#fce7f3"];
type EditorTheme = "light" | "dark";

function getMindElixirTheme(theme: EditorTheme) {
  if (theme === "dark") {
    return {
      name: "Mindmap Tools Dark",
      palette: ["#60a5fa", "#2dd4bf", "#f59e0b", "#a78bfa", "#fb7185", "#4ade80"],
      cssVar: {
        "--main-color": "#dbeafe",
        "--main-bgcolor": "#1e3a8a",
        "--color": "#e5e7eb",
        "--bgcolor": "#1f2937",
        "--selected": "#f59e0b",
        "--accent-color": "#60a5fa",
        "--root-color": "#eff6ff",
        "--root-bgcolor": "#020617",
        "--root-radius": "8px",
        "--main-radius": "7px",
        "--topic-padding": "8px",
      },
    };
  }

  return {
    name: "Mindmap Tools",
    palette: ["#3568d4", "#0f766e", "#b45309", "#7c3aed", "#be123c", "#15803d"],
    cssVar: {
      "--main-color": "#18212f",
      "--main-bgcolor": "#e7f0ff",
      "--color": "#18212f",
      "--bgcolor": "#ffffff",
      "--selected": "#3568d4",
      "--accent-color": "#3568d4",
      "--root-color": "#ffffff",
      "--root-bgcolor": "#18212f",
      "--root-radius": "8px",
      "--main-radius": "7px",
      "--topic-padding": "8px",
    },
  };
}

function findNodeByTitle(node: MindmapNode, title: string): MindmapNode | undefined {
  if (node.title === title) return node;
  for (const child of node.children) {
    const found = findNodeByTitle(child, title);
    if (found) return found;
  }
  return undefined;
}

function getTopicNodeId(topic: Element, document: MindmapDocument): string | undefined {
  const nodeObj = (topic as unknown as { nodeObj?: { id?: string } }).nodeObj;
  if (nodeObj?.id) return nodeObj.id;
  const title = topic.textContent?.trim();
  if (!title) return undefined;
  return findNodeByTitle(document.root, title)?.id;
}

function markSelectedNode(host: HTMLElement | null, id: string, document?: MindmapDocument) {
  if (!host) return;
  host.querySelectorAll("me-tpc.current-node").forEach((element) => element.classList.remove("current-node"));
  const selectedTitle = document ? findNode(document.root, id)?.title : undefined;
  const topic = Array.from(host.querySelectorAll("me-tpc")).find(
    (element) => (element as unknown as { nodeObj?: { id?: string } }).nodeObj?.id === id || element.textContent?.trim() === selectedTitle,
  );
  topic?.classList.add("current-node");
}

export function MindElixirEditor({
  document,
  selectedNodeId,
  inlineEditRequest,
  theme = "light",
  showNoteEditorInContextMenu = false,
  onDocumentChange,
  onSelectedNodeChange,
  onEditNodeNotes,
}: {
  document: MindmapDocument;
  selectedNodeId: string;
  inlineEditRequest: number;
  theme?: EditorTheme;
  showNoteEditorInContextMenu?: boolean;
  onDocumentChange: (document: MindmapDocument) => void;
  onSelectedNodeChange: (id: string) => void;
  onEditNodeNotes?: (id: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<MindElixirInstance | null>(null);
  const documentRef = useRef(document);
  const selectedNodeIdRef = useRef(selectedNodeId);
  const internalUpdateRef = useRef(false);
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const selectedInlineEditIdRef = useRef<string | null>(null);
  const [inlineEdit, setInlineEdit] = useState<InlineEditState | null>(null);
  const [colorMenu, setColorMenu] = useState<ColorMenuState | null>(null);

  useEffect(() => {
    documentRef.current = document;
  }, [document]);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
    markSelectedNode(canvasRef.current, selectedNodeId, documentRef.current);
  }, [selectedNodeId]);

  useEffect(() => {
    if (!hostRef.current || !canvasRef.current || instanceRef.current) return;
    const host = hostRef.current;
    const canvas = canvasRef.current;

    const mind = new MindElixir({
      el: canvas,
      direction: MindElixir.RIGHT,
      editable: true,
      keypress: true,
      contextMenu: false,
      toolBar: true,
      mouseSelectionButton: 0,
      newTopicName: "New idea",
      allowUndo: true,
      overflowHidden: false,
      theme: getMindElixirTheme(theme),
    });

    mind.init(toMindElixirData(documentRef.current));
    markSelectedNode(canvas, selectedNodeIdRef.current, documentRef.current);
    mind.bus.addListener("operation", () => {
      if (internalUpdateRef.current) return;
      onDocumentChange(fromMindElixirData(mind.getData(), documentRef.current));
    });
    mind.bus.addListener("selectNodes", (nodes) => {
      const first = nodes[0];
      if (first?.id) onSelectedNodeChange(first.id);
    });
    instanceRef.current = mind;

    const beginInlineEdit = (target?: EventTarget | null) => {
      const topic =
        target instanceof HTMLElement
          ? target.closest("me-tpc")
          : mind.currentNode ?? mind.findEle(selectedNodeIdRef.current);
      if (!topic) return;
      mind.selectNode(topic as Parameters<typeof mind.selectNode>[0]);
      const nodeId = getTopicNodeId(topic, documentRef.current);
      if (!nodeId) return;
      const nodeObj = (topic as unknown as { nodeObj?: { topic?: string } }).nodeObj;
      const title = nodeObj?.topic ?? topic.textContent ?? "";
      const hostRect = host.getBoundingClientRect();
      const topicRect = topic.getBoundingClientRect();
      setInlineEdit({
        id: nodeId,
        value: title,
        left: topicRect.left - hostRect.left,
        top: topicRect.top - hostRect.top,
        width: Math.max(topicRect.width, 130),
        height: Math.max(topicRect.height, 38),
      });
    };
    const handleDoubleClick = (event: MouseEvent) => beginInlineEdit(event.target);
    const handleClick = (event: MouseEvent) => {
      const topic = event.target instanceof HTMLElement ? event.target.closest("me-tpc") : null;
      if (!topic) return;
      mind.selectNode(topic as Parameters<typeof mind.selectNode>[0]);
      const nodeId = getTopicNodeId(topic, documentRef.current);
      if (!nodeId) return;
      onSelectedNodeChange(nodeId);
      markSelectedNode(canvas, nodeId, documentRef.current);
    };
    const handleContextMenu = (event: MouseEvent) => {
      const topic = event.target instanceof HTMLElement ? event.target.closest("me-tpc") : null;
      if (!topic) return;
      event.preventDefault();
      event.stopPropagation();
      mind.selectNode(topic as Parameters<typeof mind.selectNode>[0]);
      const nodeId = getTopicNodeId(topic, documentRef.current);
      if (!nodeId) return;
      onSelectedNodeChange(nodeId);
      const hostRect = host.getBoundingClientRect();
      setColorMenu({
        id: nodeId,
        left: event.clientX - hostRect.left,
        top: event.clientY - hostRect.top,
      });
    };
    const closeColorMenu = () => setColorMenu(null);
    canvas.addEventListener("click", handleClick, true);
    canvas.addEventListener("dblclick", handleDoubleClick, true);
    canvas.addEventListener("contextmenu", handleContextMenu, true);
    window.addEventListener("click", closeColorMenu);
    window.addEventListener("keydown", closeColorMenu);

    return () => {
      canvas.removeEventListener("click", handleClick, true);
      canvas.removeEventListener("dblclick", handleDoubleClick, true);
      canvas.removeEventListener("contextmenu", handleContextMenu, true);
      window.removeEventListener("click", closeColorMenu);
      window.removeEventListener("keydown", closeColorMenu);
      mind.destroy();
      instanceRef.current = null;
    };
  }, [onDocumentChange, onSelectedNodeChange, theme]);

  useEffect(() => {
    const mind = instanceRef.current;
    if (!mind) return;
    internalUpdateRef.current = true;
    mind.refresh(toMindElixirData(document));
    mind.clearHistory?.();
    window.setTimeout(() => {
      internalUpdateRef.current = false;
      markSelectedNode(canvasRef.current, selectedNodeIdRef.current, documentRef.current);
    }, 0);
  }, [document]);

  useEffect(() => {
    if (!inlineEditRequest) return;
    const mind = instanceRef.current;
    const host = hostRef.current;
    if (!mind || !host) return;
    const topic = mind.findEle(selectedNodeIdRef.current);
    if (!topic) return;
    const nodeId = getTopicNodeId(topic, documentRef.current);
    if (!nodeId) return;
    const nodeObj = (topic as unknown as { nodeObj?: { topic?: string } }).nodeObj;
    const hostRect = host.getBoundingClientRect();
    const topicRect = topic.getBoundingClientRect();
    setInlineEdit({
      id: nodeId,
      value: nodeObj?.topic ?? topic.textContent ?? "",
      left: topicRect.left - hostRect.left,
      top: topicRect.top - hostRect.top,
      width: Math.max(topicRect.width, 130),
      height: Math.max(topicRect.height, 38),
    });
  }, [inlineEditRequest]);

  useEffect(() => {
    if (!inlineEdit) {
      selectedInlineEditIdRef.current = null;
      return;
    }
    if (selectedInlineEditIdRef.current !== inlineEdit.id) {
      inlineInputRef.current?.select();
      selectedInlineEditIdRef.current = inlineEdit.id;
    }
  }, [inlineEdit]);

  const commitInlineEdit = () => {
    if (!inlineEdit) return;
    const title = inlineEdit.value.trim();
    setInlineEdit(null);
    if (!title) return;
    onDocumentChange(updateNode(documentRef.current, inlineEdit.id, { title }));
    onSelectedNodeChange(inlineEdit.id);
    window.setTimeout(() => markSelectedNode(canvasRef.current, inlineEdit.id, documentRef.current), 0);
  };

  const chooseColor = (color: string) => {
    if (!colorMenu) return;
    onDocumentChange(updateNode(documentRef.current, colorMenu.id, { visual: { color } }));
    onSelectedNodeChange(colorMenu.id);
    setColorMenu(null);
    window.setTimeout(() => markSelectedNode(canvasRef.current, colorMenu.id, documentRef.current), 0);
  };

  const moveToRoot = () => {
    if (!colorMenu || colorMenu.id === documentRef.current.root.id) return;
    onDocumentChange(moveNode(documentRef.current, colorMenu.id, documentRef.current.root.id));
    onSelectedNodeChange(colorMenu.id);
    setColorMenu(null);
    window.setTimeout(() => markSelectedNode(canvasRef.current, colorMenu.id, documentRef.current), 0);
  };

  const editNotes = () => {
    if (!colorMenu) return;
    onSelectedNodeChange(colorMenu.id);
    onEditNodeNotes?.(colorMenu.id);
    setColorMenu(null);
    window.setTimeout(() => markSelectedNode(canvasRef.current, colorMenu.id, documentRef.current), 0);
  };

  return (
    <div ref={hostRef} className={`mind-elixir-host mind-elixir-${theme}`} aria-label="Mind tree editor">
      <div ref={canvasRef} className="mind-elixir-canvas" />
      {colorMenu ? (
        <div
          className="node-color-menu"
          role="menu"
          aria-label="Node color"
          style={{
            left: colorMenu.left,
            top: colorMenu.top,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          {showNoteEditorInContextMenu ? (
            <button type="button" role="menuitem" className="node-menu-action" onClick={editNotes}>
              Edit properties
            </button>
          ) : null}
          <button type="button" role="menuitem" className="node-menu-action" disabled={colorMenu.id === document.root.id} onClick={moveToRoot}>
            Move to root
          </button>
          {nodeColors.map((color) => (
            <button
              key={color}
              type="button"
              role="menuitem"
              className="node-color-swatch"
              style={{ backgroundColor: color }}
              aria-label={`Set node color ${color}`}
              title={color}
              onClick={() => chooseColor(color)}
            />
          ))}
        </div>
      ) : null}
      {inlineEdit ? (
        <input
          ref={inlineInputRef}
          className="inline-node-editor"
          aria-label="Inline node title"
          value={inlineEdit.value}
          style={{
            left: inlineEdit.left,
            top: inlineEdit.top,
            width: inlineEdit.width,
            minHeight: inlineEdit.height,
          }}
          onChange={(event) => setInlineEdit((current) => (current ? { ...current, value: event.target.value } : current))}
          onBlur={commitInlineEdit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              commitInlineEdit();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setInlineEdit(null);
            }
          }}
        />
      ) : null}
    </div>
  );
}
