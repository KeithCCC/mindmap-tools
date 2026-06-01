import MindElixir, { type MindElixirInstance } from "mind-elixir";
import { useEffect, useRef, useState } from "react";
import { MindmapDocument, updateNode } from "../domain/mindmap";
import { fromMindElixirData, toMindElixirData } from "../converters/mindElixir";

type InlineEditState = {
  id: string;
  value: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

function markSelectedNode(host: HTMLElement | null, id: string) {
  if (!host) return;
  host.querySelectorAll("me-tpc.current-node").forEach((element) => element.classList.remove("current-node"));
  const topic = Array.from(host.querySelectorAll("me-tpc")).find(
    (element) => (element as unknown as { nodeObj?: { id?: string } }).nodeObj?.id === id,
  );
  topic?.classList.add("current-node");
}

export function MindElixirEditor({
  document,
  selectedNodeId,
  inlineEditRequest,
  onDocumentChange,
  onSelectedNodeChange,
}: {
  document: MindmapDocument;
  selectedNodeId: string;
  inlineEditRequest: number;
  onDocumentChange: (document: MindmapDocument) => void;
  onSelectedNodeChange: (id: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<MindElixirInstance | null>(null);
  const documentRef = useRef(document);
  const selectedNodeIdRef = useRef(selectedNodeId);
  const internalUpdateRef = useRef(false);
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const [inlineEdit, setInlineEdit] = useState<InlineEditState | null>(null);

  useEffect(() => {
    documentRef.current = document;
  }, [document]);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
    markSelectedNode(canvasRef.current, selectedNodeId);
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
      contextMenu: true,
      toolBar: true,
      mouseSelectionButton: 0,
      newTopicName: "New idea",
      allowUndo: true,
      overflowHidden: false,
      theme: {
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
      },
    });

    mind.init(toMindElixirData(documentRef.current));
    markSelectedNode(canvas, selectedNodeIdRef.current);
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
      const nodeObj = (topic as unknown as { nodeObj?: { id?: string; topic?: string } }).nodeObj;
      if (!nodeObj?.id) return;
      const hostRect = host.getBoundingClientRect();
      const topicRect = topic.getBoundingClientRect();
      setInlineEdit({
        id: nodeObj.id,
        value: nodeObj.topic ?? topic.textContent ?? "",
        left: topicRect.left - hostRect.left,
        top: topicRect.top - hostRect.top,
        width: Math.max(topicRect.width, 130),
        height: Math.max(topicRect.height, 38),
      });
    };
    const handleDoubleClick = (event: MouseEvent) => beginInlineEdit(event.target);
    canvas.addEventListener("dblclick", handleDoubleClick, true);

    return () => {
      canvas.removeEventListener("dblclick", handleDoubleClick, true);
      mind.destroy();
      instanceRef.current = null;
    };
  }, [onDocumentChange, onSelectedNodeChange]);

  useEffect(() => {
    const mind = instanceRef.current;
    if (!mind) return;
    internalUpdateRef.current = true;
    mind.refresh(toMindElixirData(document));
    mind.clearHistory?.();
    window.setTimeout(() => {
      internalUpdateRef.current = false;
      markSelectedNode(canvasRef.current, selectedNodeIdRef.current);
    }, 0);
  }, [document]);

  useEffect(() => {
    if (!inlineEditRequest) return;
    const mind = instanceRef.current;
    const host = hostRef.current;
    if (!mind || !host) return;
    const topic = mind.findEle(selectedNodeIdRef.current);
    if (!topic) return;
    const nodeObj = (topic as unknown as { nodeObj?: { id?: string; topic?: string } }).nodeObj;
    if (!nodeObj?.id) return;
    const hostRect = host.getBoundingClientRect();
    const topicRect = topic.getBoundingClientRect();
    setInlineEdit({
      id: nodeObj.id,
      value: nodeObj.topic ?? topic.textContent ?? "",
      left: topicRect.left - hostRect.left,
      top: topicRect.top - hostRect.top,
      width: Math.max(topicRect.width, 130),
      height: Math.max(topicRect.height, 38),
    });
  }, [inlineEditRequest]);

  useEffect(() => {
    if (inlineEdit) inlineInputRef.current?.select();
  }, [inlineEdit]);

  const commitInlineEdit = () => {
    if (!inlineEdit) return;
    const title = inlineEdit.value.trim();
    setInlineEdit(null);
    if (!title) return;
    onDocumentChange(updateNode(documentRef.current, inlineEdit.id, { title }));
    onSelectedNodeChange(inlineEdit.id);
    window.setTimeout(() => markSelectedNode(canvasRef.current, inlineEdit.id), 0);
  };

  return (
    <div ref={hostRef} className="mind-elixir-host" aria-label="Mind tree editor">
      <div ref={canvasRef} className="mind-elixir-canvas" />
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
          onChange={(event) => setInlineEdit({ ...inlineEdit, value: event.target.value })}
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
