import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addNode, createMindmapDocument, type MindmapDocument } from "../domain/mindmap";
import { MindElixirEditor } from "./MindElixirEditor";

let topicElement: HTMLElement;

vi.mock("mind-elixir", () => {
  class MockMindElixir {
    static RIGHT = 1;

    bus = {
      addListener: vi.fn(),
    };

    currentNode: HTMLElement | null = null;

    constructor({ el }: { el: HTMLElement }) {
      topicElement = document.createElement("me-tpc");
      topicElement.textContent = "Brainstorm";
      (topicElement as unknown as { nodeObj: { id: string; topic: string } }).nodeObj = {
        id: "root",
        topic: "Brainstorm",
      };
      el.appendChild(topicElement);
      this.currentNode = topicElement;
    }

    init = vi.fn();
    refresh = vi.fn();
    clearHistory = vi.fn();
    destroy = vi.fn();
    getData = vi.fn();
    findEle = vi.fn(() => topicElement);
    selectNode = vi.fn();
  }

  return {
    default: MockMindElixir,
  };
});

function renderEditor(document: MindmapDocument, inlineEditRequest = 1) {
  const onDocumentChange = vi.fn();
  const onSelectedNodeChange = vi.fn();
  render(
    <MindElixirEditor
      document={document}
      selectedNodeId={document.root.id}
      inlineEditRequest={inlineEditRequest}
      onDocumentChange={onDocumentChange}
      onSelectedNodeChange={onSelectedNodeChange}
    />,
  );
  return { onDocumentChange, onSelectedNodeChange };
}

describe("MindElixirEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    await user.click(screen.getByRole("menuitem", { name: "Set node color #dcfce7" }));

    expect(onSelectedNodeChange).toHaveBeenCalledWith("root");
    expect(onDocumentChange).toHaveBeenCalledWith(
      expect.objectContaining({
        root: expect.objectContaining({
          visual: { color: "#dcfce7" },
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
});
