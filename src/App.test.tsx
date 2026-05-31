import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

describe("App", () => {
  it("creates and edits a mindmap node", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /add child/i }));
    const titleInput = screen.getByLabelText("Selected node title");
    await user.clear(titleInput);
    await user.type(titleInput, "Market research");

    expect(screen.getByRole("button", { name: "Market research" })).toBeInTheDocument();
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
