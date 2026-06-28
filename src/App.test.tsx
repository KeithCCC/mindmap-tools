import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

vi.mock("./components/MindElixirEditor", () => ({
  MindElixirEditor: ({
    inlineEditRequest,
    selectedNodeId,
  }: {
    inlineEditRequest: number;
    selectedNodeId: string;
  }) => (
    <div data-inline-edit-request={inlineEditRequest} data-selected-node-id={selectedNodeId} data-testid="mind-elixir-editor">
      Mock Mind Elixir editor
    </div>
  ),
}));

async function blobText(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses Mind Elixir as the visual mind tree editor", () => {
    render(<App />);

    expect(screen.getByTestId("mind-elixir-editor")).toBeInTheDocument();
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

  it("hides Neon cloud storage controls while local file management is primary", () => {
    render(<App />);

    expect(screen.queryByRole("button", { name: "Save to Neon" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Cloud" })).not.toBeInTheDocument();
  });

  it("creates and edits a mindmap node", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /add child/i }));
    const titleInput = screen.getByLabelText("Selected node title");
    await user.clear(titleInput);
    await user.type(titleInput, "Market research");

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

  it("imports Mermaid text and updates the tree", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("tab", { name: "Import" }));
    await user.type(screen.getByLabelText("Mermaid mindmap input"), "mindmap\n  Plan\n    UX\n    Data");
    await user.click(screen.getByRole("button", { name: /import mermaid/i }));

    expect(screen.getByRole("button", { name: "Plan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "UX" })).toBeInTheDocument();
  });
});
