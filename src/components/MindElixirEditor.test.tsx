import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addNode, createMindmapDocument, type MindmapDocument } from "../domain/mindmap";
import { MindElixirEditor } from "./MindElixirEditor";

let topicElement: HTMLElement;
let mapCanvasElement: HTMLElement;
let latestMindElixirOptions: { theme?: { name?: string; cssVar?: Record<string, string> } } | undefined;
const moveMock = vi.fn();
const selectNodeMock = vi.fn();

vi.mock("mind-elixir", () => {
  class MockMindElixir {
    static RIGHT = 1;

    bus = {
      addListener: vi.fn(),
    };

    currentNode: HTMLElement | null = null;

    constructor(options: { el: HTMLElement; theme?: { name?: string; cssVar?: Record<string, string> } }) {
      latestMindElixirOptions = options;
      const { el } = options;
      mapCanvasElement = document.createElement("div");
      mapCanvasElement.className = "map-canvas";
      topicElement = document.createElement("me-tpc");
      topicElement.textContent = "Brainstorm";
      (topicElement as unknown as { nodeObj: { id: string; topic: string } }).nodeObj = {
        id: "root",
        topic: "Brainstorm",
      };
      mapCanvasElement.appendChild(topicElement);
      el.appendChild(mapCanvasElement);
      this.currentNode = topicElement;
    }

    init = vi.fn();
    refresh = vi.fn();
    clearHistory = vi.fn();
    destroy = vi.fn();
    getData = vi.fn();
    findEle = vi.fn(() => topicElement);
    move = moveMock;
    selectNode = selectNodeMock;
  }

  return {
    default: MockMindElixir,
  };
});

function renderEditor(document: MindmapDocument, inlineEditRequest = 1, showNoteEditorInContextMenu = false, theme: "light" | "dark" = "light") {
  const onDocumentChange = vi.fn();
  const onSelectedNodeChange = vi.fn();
  const onEditNodeNotes = vi.fn();
  render(
    <MindElixirEditor
      document={document}
      selectedNodeId={document.root.id}
      inlineEditRequest={inlineEditRequest}
      theme={theme}
      showNoteEditorInContextMenu={showNoteEditorInContextMenu}
      onDocumentChange={onDocumentChange}
      onSelectedNodeChange={onSelectedNodeChange}
      onEditNodeNotes={onEditNodeNotes}
    />,
  );
  return { onDocumentChange, onSelectedNodeChange, onEditNodeNotes };
}

describe("MindElixirEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    moveMock.mockClear();
    selectNodeMock.mockClear();
    latestMindElixirOptions = undefined;
  });

  it("does not reselect inline text after each typed character", async () => {
    const user = userEvent.setup();
    const document = createMindmapDocument("Brainstorm");
    document.root.id = "root";
    renderEditor(document);

    const input = await screen.findByLabelText("Inline node title");
    await user.clear(input);
    await user.type(input, "ABCD");

    expect(input).toHaveValue("ABCD");
  });

  it("opens a node color menu on right click and updates visual color", async () => {
    const user = userEvent.setup();
    const document = createMindmapDocument("Brainstorm");
    document.root.id = "root";
    const { onDocumentChange, onSelectedNodeChange } = renderEditor(document, 0);

    fireEvent.contextMenu(topicElement, { clientX: 40, clientY: 50 });
    await user.click(screen.getByRole("menuitem", { name: "Set node color #86efac" }));

    expect(onSelectedNodeChange).toHaveBeenCalledWith("root");
    expect(onDocumentChange).toHaveBeenCalledWith(
      expect.objectContaining({
        root: expect.objectContaining({
          visual: { color: "#86efac" },
        }),
      }),
    );
  });

  it("selects the clicked canvas node", async () => {
    const user = userEvent.setup();
    const document = createMindmapDocument("Brainstorm");
    document.root.id = "root";
    const { onSelectedNodeChange } = renderEditor(document, 0);
    (topicElement as unknown as { nodeObj: { id: string; topic: string } }).nodeObj = {
      id: "fmi",
      topic: "FMI",
    };

    await user.click(topicElement);

    expect(onSelectedNodeChange).toHaveBeenCalledWith("fmi");
    expect(selectNodeMock).not.toHaveBeenCalled();
  });

  it("preserves the panned viewport transform after clicking a node", async () => {
    const user = userEvent.setup();
    const document = createMindmapDocument("Brainstorm");
    document.root.id = "root";
    renderEditor(document, 0);
    mapCanvasElement.style.transform = "matrix(1, 0, 0, 1, 180, -60)";
    topicElement.addEventListener("mousedown", () => {
      mapCanvasElement.style.transform = "matrix(1, 0, 0, 1, 322, -346)";
    });

    await user.click(topicElement);
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(mapCanvasElement.style.transform).toBe("matrix(1, 0, 0, 1, 180, -60)");
  });

  it("moves the right-clicked node to the root", async () => {
    const user = userEvent.setup();
    let document = createMindmapDocument("Brainstorm");
    document.root.id = "root";
    document = addNode(document, document.root.id, "Parent");
    document.root.children[0].id = "parent";
    document = addNode(document, "parent", "FMI");
    document.root.children[0].children[0].id = "fmi";
    const { onDocumentChange, onSelectedNodeChange } = renderEditor(document, 0);
    (topicElement as unknown as { nodeObj: { id: string; topic: string } }).nodeObj = {
      id: "fmi",
      topic: "FMI",
    };

    fireEvent.contextMenu(topicElement, { clientX: 40, clientY: 50 });
    await user.click(screen.getByRole("menuitem", { name: "Move to root" }));

    expect(onSelectedNodeChange).toHaveBeenCalledWith("fmi");
    const nextDocument = onDocumentChange.mock.calls[0]?.[0] as MindmapDocument;
    expect(nextDocument.root.children.map((node) => node.title)).toEqual(["Parent", "FMI"]);
    expect(nextDocument.root.children[0].children).toHaveLength(0);
  });

  it("shows edit notes in the context menu when enabled", async () => {
    const user = userEvent.setup();
    const document = createMindmapDocument("Brainstorm");
    document.root.id = "root";
    const { onEditNodeNotes, onSelectedNodeChange } = renderEditor(document, 0, true);

    fireEvent.contextMenu(topicElement, { clientX: 40, clientY: 50 });
    await user.click(screen.getByRole("menuitem", { name: "Edit Notes" }));

    expect(onSelectedNodeChange).toHaveBeenCalledWith("root");
    expect(onEditNodeNotes).toHaveBeenCalledWith("root");
  });

  it("initializes Mind Elixir with the dark theme", () => {
    const document = createMindmapDocument("Brainstorm");
    document.root.id = "root";

    renderEditor(document, 0, false, "dark");

    expect(latestMindElixirOptions?.theme?.name).toBe("Mindmap Tools Dark");
    expect(latestMindElixirOptions?.theme?.cssVar?.["--bgcolor"]).toBe("#1f2937");
    expect(latestMindElixirOptions?.theme?.cssVar?.["--root-bgcolor"]).toBe("#020617");
  });

  it("moves the Mind Elixir pane when keyboard pan events are received", () => {
    const document = createMindmapDocument("Brainstorm");
    document.root.id = "root";
    renderEditor(document, 0);

    window.dispatchEvent(new CustomEvent("mindmap-pan", { detail: { dx: 80, dy: 0 } }));

    expect(moveMock).toHaveBeenCalledWith(80, 0, true);
  });
});
