import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMindmapDocument, type MindmapDocument } from "../domain/mindmap";
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
  render(
    <MindElixirEditor
      document={document}
      selectedNodeId={document.root.id}
      inlineEditRequest={inlineEditRequest}
      onDocumentChange={onDocumentChange}
      onSelectedNodeChange={vi.fn()}
    />,
  );
  return { onDocumentChange };
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
});
