import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

let latestEditorDocumentChange: ((document: unknown) => void) | undefined;

vi.mock("./components/MindElixirEditor", () => ({
  MindElixirEditor: ({
    inlineEditRequest,
    onDocumentChange,
    onEditNodeNotes,
    selectedNodeId,
    showNoteEditorInContextMenu,
  }: {
    inlineEditRequest: number;
    onDocumentChange?: (document: unknown) => void;
    onEditNodeNotes?: (id: string) => void;
    selectedNodeId: string;
    showNoteEditorInContextMenu?: boolean;
  }) => {
    latestEditorDocumentChange = onDocumentChange;
    return (
      <div data-inline-edit-request={inlineEditRequest} data-selected-node-id={selectedNodeId} data-testid="mind-elixir-editor">
        Mock Mind Elixir editor
        {showNoteEditorInContextMenu ? (
          <button type="button" onClick={() => onEditNodeNotes?.(selectedNodeId)}>
            Mock Edit Notes
          </button>
        ) : null}
      </div>
    );
  },
}));

async function blobText(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

function createDataTransfer() {
  const data = new Map<string, string>();
  return {
    dropEffect: "move",
    effectAllowed: "move",
    getData: (type: string) => data.get(type) ?? "",
    setData: (type: string, value: string) => data.set(type, value),
  };
}

function createDragEvent(type: string, dataTransfer: ReturnType<typeof createDataTransfer>, clientY: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  Object.defineProperty(event, "clientY", { value: clientY });
  return event;
}

function getRootChildTitles() {
  return Array.from(document.querySelectorAll(".tree > li > ul > li > .tree-node-row > button.node")).map((element) => element.textContent);
}

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    latestEditorDocumentChange = undefined;
  });

  it("uses Mind Elixir as the visual mind tree editor", () => {
    render(<App />);

    expect(screen.getByTestId("mind-elixir-editor")).toBeInTheDocument();
    expect(screen.getByText(/^Futaba \(Mindmap\) 0\.1\.0 · Built \d{4}-\d{2}-\d{2}T/)).toBeInTheDocument();
    expect(window.document.title).toMatch(/^Futaba \(Mindmap\) 0\.1\.0 · Built \d{4}-\d{2}-\d{2}T/);
  });

  it("exposes Excalidraw export from the header", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "Export Excalidraw" })).toBeInTheDocument();
  });

  it("downloads Excalidraw export data from the header", async () => {
    const user = userEvent.setup();
    const createObjectUrl = vi.fn((_: Blob) => "blob:mindmap");
    const revokeObjectUrl = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl });

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Export Excalidraw" }));

    expect(click).toHaveBeenCalledTimes(1);
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    const blob = createObjectUrl.mock.calls[0]?.[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/json");
    const text = await blobText(blob);
    const payload = JSON.parse(text) as { type?: string; source?: string };
    expect(payload.type).toBe("excalidraw");
    expect(payload.source).toBe("mindmap-tools");
    expect(revokeObjectUrl).not.toHaveBeenCalled();
  });

  it("saves current mindmap data as JSON", async () => {
    const user = userEvent.setup();
    const createObjectUrl = vi.fn((_: Blob) => "blob:data");
    const revokeObjectUrl = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl });

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Download JSON" }));

    const blob = createObjectUrl.mock.calls[0]?.[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/json");
    const payload = JSON.parse(await blobText(blob)) as { title?: string; root?: { title?: string } };
    expect(payload.title).toBe("Brainstorm");
    expect(payload.root?.title).toBe("Brainstorm");
    expect(revokeObjectUrl).not.toHaveBeenCalled();
  });

  it("edits map file name separately from selected node title", async () => {
    const user = userEvent.setup();
    render(<App />);

    const mapNameInput = screen.getByLabelText("Map file name");
    const nodeTitleInput = screen.getByLabelText("Selected node title");
    await user.clear(mapNameInput);
    await user.type(mapNameInput, "Customer Discovery File");
    await user.clear(nodeTitleInput);
    await user.type(nodeTitleInput, "Research Questions");

    expect(screen.getByLabelText("Map file name")).toHaveValue("Customer Discovery File");
    expect(screen.getByLabelText("Selected node title")).toHaveValue("Research Questions");
    expect(screen.getByRole("heading", { name: "Research Questions" })).toBeInTheDocument();
  });

  it("loads mindmap data from a JSON file", async () => {
    render(<App />);
    const file = new File(
      [
        JSON.stringify({
          id: "doc-loaded",
          title: "Loaded Map",
          root: { id: "root-loaded", title: "Loaded Map", children: [] },
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ],
      "mindmap-tools.json",
      { type: "application/json" },
    );

    fireEvent.change(screen.getByLabelText("Load mindmap data file"), { target: { files: [file] } });

    expect(await screen.findByRole("heading", { name: "Loaded Map" })).toBeInTheDocument();
  });

  it("persists mindmap data in browser storage", async () => {
    const user = userEvent.setup();
    render(<App />);

    const titleInput = screen.getByLabelText("Selected node title");
    await user.clear(titleInput);
    await user.type(titleInput, "Persisted Map");

    await waitFor(() => {
      const stored = window.localStorage.getItem("mindmap-tools.document");
      expect(stored).toContain("Persisted Map");
    });
  });

  it("toggles and persists dark theme mode", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);

    await user.click(screen.getByRole("button", { name: "Dark theme" }));

    expect(document.querySelector(".app-shell")).toHaveClass("theme-dark");
    expect(window.localStorage.getItem("mindmap-tools.theme")).toBe("dark");

    unmount();
    render(<App />);

    expect(document.querySelector(".app-shell")).toHaveClass("theme-dark");
    expect(screen.getByRole("button", { name: "Light theme" })).toBeInTheDocument();
  });

  it("dispatches mindmap pane movement while Space is held with arrow keys", async () => {
    const panEvents: Array<{ dx: number; dy: number }> = [];
    window.addEventListener("mindmap-pan", ((event: CustomEvent<{ dx: number; dy: number }>) => {
      panEvents.push(event.detail);
    }) as EventListener);
    const user = userEvent.setup();
    render(<App />);

    await user.keyboard("[Space>][ArrowUp][ArrowLeft][/Space]");

    expect(panEvents).toEqual([
      { dx: 0, dy: 80 },
      { dx: 80, dy: 0 },
    ]);
    expect(screen.getByTestId("mind-elixir-editor").dataset.selectedNodeId).toBeDefined();
  });

  it("keeps the Mind Elixir document callback stable after selecting a new node", async () => {
    const user = userEvent.setup();
    render(<App />);

    const initialCallback = latestEditorDocumentChange;
    await user.click(screen.getByRole("button", { name: "Add child" }));

    expect(latestEditorDocumentChange).toBe(initialCallback);
  });

  it("resets current editing data", async () => {
    const user = userEvent.setup();
    render(<App />);
    const titleInput = screen.getByLabelText("Selected node title");
    await user.clear(titleInput);
    await user.type(titleInput, "Temporary Map");

    await user.click(screen.getByRole("button", { name: "Reset Data" }));

    expect(screen.getByRole("heading", { name: "Brainstorm" })).toBeInTheDocument();
    expect(screen.getByLabelText("Selected node title")).toHaveValue("Brainstorm");
  });

  it("undoes the last document change from the header button", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Add child" }));

    await user.click(screen.getByRole("button", { name: "Undo" }));

    await user.click(screen.getByRole("button", { name: "Open outline" }));
    expect(screen.queryByRole("button", { name: "New idea" })).not.toBeInTheDocument();
  });

  it("undoes a node addition with Ctrl+Z when focus is in the editor", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByTestId("mind-elixir-editor"));
    await user.keyboard("{Tab}");
    const addedNodeId = screen.getByTestId("mind-elixir-editor").dataset.selectedNodeId;

    await user.keyboard("{Control>}{z}{/Control}");

    expect(screen.getByTestId("mind-elixir-editor").dataset.selectedNodeId).not.toBe(addedNodeId);
    await user.click(screen.getByRole("button", { name: "Open outline" }));
    expect(screen.queryByRole("button", { name: "New idea" })).not.toBeInTheDocument();
  });

  it("selects the parent node and preserves children after deleting a nested selected node", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Add child" }));
    const titleInput = screen.getByLabelText("Selected node title");
    await user.clear(titleInput);
    await user.type(titleInput, "Parent idea");

    await user.click(screen.getByRole("button", { name: "Add child" }));
    await user.clear(titleInput);
    await user.type(titleInput, "Nested idea");
    await user.click(screen.getByRole("button", { name: "Delete node" }));
    await user.click(screen.getByRole("button", { name: "Delete only this node" }));

    expect(screen.getByLabelText("Selected node title")).toHaveValue("Parent idea");
  });

  it("deletes only the highlighted node from a chain", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Add child" }));
    const titleInput = screen.getByLabelText("Selected node title");
    await user.clear(titleInput);
    await user.type(titleInput, "A");

    await user.click(screen.getByRole("button", { name: "Add child" }));
    await user.clear(titleInput);
    await user.type(titleInput, "B");

    await user.click(screen.getByRole("button", { name: "Add child" }));
    await user.clear(titleInput);
    await user.type(titleInput, "C");

    await user.click(screen.getByRole("button", { name: "Open outline" }));
    await user.click(screen.getByRole("button", { name: "B" }));
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Delete node" }));
    await user.click(screen.getByRole("button", { name: "Delete only this node" }));

    expect(screen.queryByRole("button", { name: "B" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open outline" }));
    expect(screen.getByRole("button", { name: "C" })).toBeInTheDocument();
    expect(screen.getByLabelText("Selected node title")).toHaveValue("A");
  });

  it("deletes the highlighted node and child nodes when requested", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Add child" }));
    const titleInput = screen.getByLabelText("Selected node title");
    await user.clear(titleInput);
    await user.type(titleInput, "A");

    await user.click(screen.getByRole("button", { name: "Add child" }));
    await user.clear(titleInput);
    await user.type(titleInput, "B");

    await user.click(screen.getByRole("button", { name: "Add child" }));
    await user.clear(titleInput);
    await user.type(titleInput, "C");

    await user.click(screen.getByRole("button", { name: "Open outline" }));
    await user.click(screen.getByRole("button", { name: "B" }));
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Delete node" }));

    expect(screen.getByRole("dialog", { name: "Delete B" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete node and children" }));

    await user.click(screen.getByRole("button", { name: "Open outline" }));
    expect(screen.queryByRole("button", { name: "B" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "C" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Selected node title")).toHaveValue("A");
  });

  it("opens the delete choice dialog from the Delete key", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Add child" }));
    const titleInput = screen.getByLabelText("Selected node title");
    await user.clear(titleInput);
    await user.type(titleInput, "Keyboard target");
    await user.click(screen.getByTestId("mind-elixir-editor"));
    await user.keyboard("{Delete}");

    expect(screen.getByRole("dialog", { name: "Delete Keyboard target" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Delete Keyboard target" })).not.toBeInTheDocument();
  });

  it("reorders outline nodes by dragging above another node", async () => {
    const user = userEvent.setup();
    render(<App />);

    for (const title of ["A", "B", "C"]) {
      await user.click(screen.getByRole("button", { name: "Add child" }));
      const titleInput = screen.getByLabelText("Selected node title");
      await user.clear(titleInput);
      await user.type(titleInput, title);
      await user.click(screen.getByTestId("mind-elixir-editor"));
      await user.keyboard("{ArrowLeft}");
    }

    await user.click(screen.getByRole("button", { name: "Open outline" }));
    const cButton = screen.getByRole("button", { name: "C" });
    const aButton = screen.getByRole("button", { name: "A" });
    vi.spyOn(aButton, "getBoundingClientRect").mockReturnValue({
      bottom: 20,
      height: 20,
      left: 0,
      right: 120,
      top: 0,
      width: 120,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const dataTransfer = createDataTransfer();

    fireEvent(cButton, createDragEvent("dragstart", dataTransfer, -1));
    fireEvent(aButton, createDragEvent("dragover", dataTransfer, -1));
    fireEvent(aButton, createDragEvent("drop", dataTransfer, -1));

    const rootChildTitles = getRootChildTitles();
    expect(rootChildTitles).toEqual(["C", "A", "B"]);
    expect(screen.getByLabelText("Selected node title")).toHaveValue("C");
  });

  it("moves an outline node under the root by dropping onto the root", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Add child" }));
    const titleInput = screen.getByLabelText("Selected node title");
    await user.clear(titleInput);
    await user.type(titleInput, "Personal");
    await user.click(screen.getByRole("button", { name: "Add child" }));
    await user.clear(titleInput);
    await user.type(titleInput, "FMI");

    await user.click(screen.getByRole("button", { name: "Open outline" }));
    const fmiButton = screen.getByRole("button", { name: "FMI" });
    const rootButton = screen.getByRole("button", { name: "Brainstorm" });
    vi.spyOn(rootButton, "getBoundingClientRect").mockReturnValue({
      bottom: 30,
      height: 30,
      left: 0,
      right: 140,
      top: 0,
      width: 140,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const dataTransfer = createDataTransfer();

    fireEvent(fmiButton, createDragEvent("dragstart", dataTransfer, 15));
    fireEvent(rootButton, createDragEvent("dragover", dataTransfer, 15));
    fireEvent(rootButton, createDragEvent("drop", dataTransfer, 15));

    const rootChildTitles = getRootChildTitles();
    expect(rootChildTitles).toEqual(["Personal", "FMI"]);
    expect(screen.getByLabelText("Selected node title")).toHaveValue("FMI");
  });

  it("moves the selected node back under the root from the edit panel", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Add child" }));
    const titleInput = screen.getByLabelText("Selected node title");
    await user.clear(titleInput);
    await user.type(titleInput, "Personal");
    await user.click(screen.getByRole("button", { name: "Add child" }));
    await user.clear(titleInput);
    await user.type(titleInput, "FMI");

    await user.click(screen.getByRole("button", { name: "Move to root" }));

    await user.click(screen.getByRole("button", { name: "Open outline" }));
    const rootChildTitles = getRootChildTitles();
    expect(rootChildTitles).toEqual(["Personal", "FMI"]);
    expect(screen.getByLabelText("Selected node title")).toHaveValue("FMI");
  });

  it("moves an outline node above its sibling with order controls", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Add child" }));
    const titleInput = screen.getByLabelText("Selected node title");
    await user.clear(titleInput);
    await user.type(titleInput, "Personal");
    await user.click(screen.getByTestId("mind-elixir-editor"));
    await user.keyboard("{ArrowLeft}");
    await user.click(screen.getByRole("button", { name: "Add child" }));
    await user.clear(titleInput);
    await user.type(titleInput, "FMI");

    await user.click(screen.getByRole("button", { name: "Open outline" }));
    await user.click(screen.getByRole("button", { name: "Move FMI up" }));

    expect(getRootChildTitles()).toEqual(["FMI", "Personal"]);
    expect(screen.getByLabelText("Selected node title")).toHaveValue("FMI");
  });

  it("downloads a markdown outline report with notes", async () => {
    const user = userEvent.setup();
    const createObjectUrl = vi.fn((_: Blob) => "blob:outline-report");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    render(<App />);

    const notesInput = screen.getByLabelText("Notes");
    await user.type(notesInput, "Root note");
    await user.click(screen.getByRole("button", { name: "Add child" }));
    const titleInput = screen.getByLabelText("Selected node title");
    await user.clear(titleInput);
    await user.type(titleInput, "Report child");
    await user.clear(notesInput);
    await user.type(notesInput, "Child note");
    await user.click(screen.getByRole("button", { name: "Open outline" }));
    await user.click(screen.getByRole("button", { name: "Export Markdown Report" }));

    expect(click).toHaveBeenCalledTimes(1);
    const blob = createObjectUrl.mock.calls[0]?.[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("text/markdown");
    const report = await blobText(blob);
    expect(report).toContain("# Brainstorm Outline Report");
    expect(report).toContain("Notes: Root note");
    expect(report).toContain("- Report child");
    expect(report).toContain("Notes: Child note");
  });

  it("opens the semantic outline as a floating dialog", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Open outline" }));

    expect(screen.getByRole("dialog", { name: "Semantic outline" })).toBeInTheDocument();
    expect(screen.getByText("Use Up/Down to sort siblings. Drag onto the top or bottom of a node to sort, or drop in the middle to move under that node.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse all" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand all" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export Markdown Report" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Semantic outline" })).not.toBeInTheDocument();
  });

  it("collapses and expands outline branches", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Add child" }));
    const titleInput = screen.getByLabelText("Selected node title");
    await user.clear(titleInput);
    await user.type(titleInput, "Parent");
    await user.click(screen.getByRole("button", { name: "Add child" }));
    await user.clear(titleInput);
    await user.type(titleInput, "Child");
    await user.click(screen.getByRole("button", { name: "Open outline" }));

    expect(screen.getByRole("button", { name: "Child" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(screen.queryByRole("button", { name: "Child" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand all" }));
    expect(screen.getByRole("button", { name: "Child" })).toBeInTheDocument();
  });

  it("hides Neon cloud storage controls while local file management is primary", () => {
    render(<App />);

    expect(screen.queryByRole("button", { name: "Save to Neon" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Cloud" })).not.toBeInTheDocument();
  });

  it("opens a centered notes editor when properties are hidden", async () => {
    const user = userEvent.setup();
    render(<App />);

    const notesInput = screen.getByLabelText("Notes");
    await user.type(notesInput, "Existing note");
    await user.click(screen.getByRole("button", { name: "Hide properties" }));

    expect(screen.queryByRole("button", { name: "Mock Edit Notes" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mock Edit Notes" }));

    const popup = screen.getByRole("dialog", { name: "Edit notes for Brainstorm" });
    expect(popup).toBeInTheDocument();
    const popupNotes = screen.getByLabelText("Popup notes") as HTMLTextAreaElement;
    await waitFor(() => {
      expect(document.activeElement).toBe(popupNotes);
      expect(popupNotes.selectionStart).toBe("Existing note".length);
    });
    await user.type(popupNotes, " updated");
    expect(popupNotes).toHaveValue("Existing note updated");

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Edit notes for Brainstorm" })).not.toBeInTheDocument();
  });

  it("creates and edits a mindmap node", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /add child/i }));
    const titleInput = screen.getByLabelText("Selected node title");
    await user.clear(titleInput);
    await user.type(titleInput, "Market research");

    await user.click(screen.getByRole("button", { name: "Open outline" }));
    expect(screen.getByRole("button", { name: "Market research" })).toBeInTheDocument();
  });

  it("opens inline editing after creating a child with Tab", async () => {
    const user = userEvent.setup();
    render(<App />);
    const editor = screen.getByTestId("mind-elixir-editor");
    const initialSelectedId = editor.dataset.selectedNodeId;

    await user.keyboard("{Tab}");

    await waitFor(() => {
      expect(screen.getByTestId("mind-elixir-editor")).toHaveAttribute("data-inline-edit-request", "1");
    });
    expect(screen.getByTestId("mind-elixir-editor").dataset.selectedNodeId).not.toBe(initialSelectedId);
  });

  it("opens inline editing after creating a sibling with Enter", async () => {
    const user = userEvent.setup();
    render(<App />);
    const editor = screen.getByTestId("mind-elixir-editor");
    const initialSelectedId = editor.dataset.selectedNodeId;

    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByTestId("mind-elixir-editor")).toHaveAttribute("data-inline-edit-request", "1");
    });
    expect(screen.getByTestId("mind-elixir-editor").dataset.selectedNodeId).not.toBe(initialSelectedId);
  });

  it("opens inline editing after inserting an intermediate node with Ctrl+Enter", async () => {
    const user = userEvent.setup();
    render(<App />);
    const editor = screen.getByTestId("mind-elixir-editor");
    const initialSelectedId = editor.dataset.selectedNodeId;
    const titleInput = screen.getByLabelText("Selected node title");

    await user.click(screen.getByRole("button", { name: "Add child" }));
    await user.clear(titleInput);
    await user.type(titleInput, "Target node");
    await user.click(screen.getByRole("button", { name: "Open outline" }));
    await user.click(screen.getByRole("button", { name: "Target node" }));
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() => {
      expect(screen.getByTestId("mind-elixir-editor")).toHaveAttribute("data-inline-edit-request", "2");
    });
    expect(screen.getByTestId("mind-elixir-editor").dataset.selectedNodeId).not.toBe(initialSelectedId);
    await user.click(screen.getByRole("button", { name: "Open outline" }));
    expect(screen.getByRole("button", { name: "Target node" })).toBeInTheDocument();
    expect(screen.getByLabelText("Selected node title")).toHaveValue("New idea");
  });

  it("imports Mermaid text and updates the tree", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("tab", { name: "Import" }));
    await user.type(screen.getByLabelText("Mermaid mindmap input"), "mindmap\n  Plan\n    UX\n    Data");
    await user.click(screen.getByRole("button", { name: /import mermaid/i }));

    await user.click(screen.getByRole("button", { name: "Open outline" }));
    expect(screen.getByRole("button", { name: "Plan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "UX" })).toBeInTheDocument();
  });
});
