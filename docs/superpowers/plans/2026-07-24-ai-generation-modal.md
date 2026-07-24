# AI Generation Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move AI generation from the Properties tabs to a discoverable toolbar button and centered modal.

**Architecture:** Keep AI request, form, and Undo state in `App`. Add one modal-open state and render the existing form in a dialog outside the Properties inspector. Reuse the application's established fixed-backdrop dialog styling and add focused responsive rules.

**Tech Stack:** React 18, TypeScript, CSS, Vitest, Testing Library, Playwright browser verification.

## Global Constraints

- Place `AI` between `Outline` and `Properties` in the main toolbar.
- Remove `AI` from the Properties tab list.
- Successful generation closes the modal; failed generation leaves it open.
- Block duplicate submission and all modal dismissal while generation is pending.
- Preserve Theme and Additional instructions when the modal is closed and reopened.
- Do not change the API contract, OpenAI settings, generated-map limits, replacement behavior, or Undo behavior.
- Support close button, `Escape`, and backdrop dismissal while idle.
- Keep the dialog within desktop and mobile viewports without horizontal overflow.

---

### Task 1: Toolbar Entry And Modal Behavior

**Files:**
- Modify: `src/App.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: existing `generateAiMindmap(): Promise<void>`, `aiTheme`, `aiInstructions`, `aiStatus`, and `isAiGenerating`.
- Produces: `isAiModalOpen: boolean`, toolbar button `AI`, and dialog named `AI mindmap`.

- [ ] **Step 1: Replace AI-tab setup with modal-focused failing tests**

Add a helper and update the existing AI tests:

```tsx
async function openAiModal(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "AI" }));
  return screen.getByRole("dialog", { name: "AI mindmap" });
}
```

Add direct coverage:

```tsx
it("opens AI generation from the toolbar instead of Properties", async () => {
  const user = userEvent.setup();
  render(<App />);

  expect(screen.queryByRole("tab", { name: "AI" })).not.toBeInTheDocument();
  await openAiModal(user);
  expect(screen.getByLabelText("Theme")).toBeInTheDocument();
});

it("dismisses an idle AI modal and preserves its input", async () => {
  const user = userEvent.setup();
  render(<App />);

  await openAiModal(user);
  await user.type(screen.getByLabelText("Theme"), "Launch plan");
  await user.click(screen.getByRole("button", { name: "Close AI mindmap" }));
  expect(screen.queryByRole("dialog", { name: "AI mindmap" })).not.toBeInTheDocument();

  await openAiModal(user);
  expect(screen.getByLabelText("Theme")).toHaveValue("Launch plan");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "AI mindmap" })).not.toBeInTheDocument();
});
```

Adapt generation tests to call `openAiModal(user)`. After a successful response assert the dialog is absent. After an error assert it remains visible. During a pending response assert `Close AI mindmap` is disabled and backdrop/Escape do not dismiss it.

- [ ] **Step 2: Run focused tests and verify the expected failure**

Run:

```powershell
npm test -- --run src/App.test.tsx
```

Expected: FAIL because no toolbar AI button or `AI mindmap` dialog exists, and the old AI tab still renders.

- [ ] **Step 3: Add modal state and toolbar entry**

Update the tab type and component state:

```tsx
type Tab = "edit" | "cloud" | "import" | "export" | "wiki";

const [isAiModalOpen, setIsAiModalOpen] = useState(false);
```

Place the toolbar command after `Outline`:

```tsx
<button type="button" aria-haspopup="dialog" onClick={() => setIsAiModalOpen(true)}>
  AI
</button>
```

Remove `"ai"` from the Properties tab list and remove the `activeTab === "ai"` section.

- [ ] **Step 4: Render the accessible modal and close it only when allowed**

Add an idle-only closer:

```tsx
const closeAiModal = () => {
  if (!isAiGenerating) setIsAiModalOpen(false);
};
```

Extend the existing Escape listener:

```tsx
if (event.key === "Escape") {
  setIsFileMenuOpen(false);
  if (!isAiGenerating) setIsAiModalOpen(false);
}
```

Render the existing AI form in the canvas overlay region:

```tsx
{isAiModalOpen ? (
  <div className="ai-dialog-backdrop" role="presentation" onMouseDown={closeAiModal}>
    <section
      className="ai-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-dialog-title"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="ai-dialog-header">
        <h2 id="ai-dialog-title">AI mindmap</h2>
        <button type="button" aria-label="Close AI mindmap" disabled={isAiGenerating} onClick={closeAiModal}>
          ×
        </button>
      </div>
      <div className="ai-dialog-content">
        <label>
          Theme
          <input
            value={aiTheme}
            maxLength={200}
            disabled={isAiGenerating}
            onChange={(event) => setAiTheme(event.target.value)}
          />
        </label>
        <label>
          Additional instructions
          <textarea
            value={aiInstructions}
            maxLength={2000}
            rows={7}
            disabled={isAiGenerating}
            onChange={(event) => setAiInstructions(event.target.value)}
          />
        </label>
        <button type="button" disabled={isAiGenerating} onClick={() => void generateAiMindmap()}>
          {isAiGenerating ? "Generating..." : "Generate mindmap"}
        </button>
        <p className="ai-status" role="status" aria-live="polite">
          {aiStatus}
        </p>
      </div>
    </section>
  </div>
) : null}
```

After `commitDocument(next, next.root.id)`, add:

```tsx
setIsAiModalOpen(false);
```

Do not close the modal in the error path.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
npm test -- --run src/App.test.tsx
```

Expected: all `App` tests pass, including toolbar discovery, idle dismissal, pending lock, success close, failure retention, and Undo.

- [ ] **Step 6: Commit behavior**

```powershell
git add src/App.tsx src/App.test.tsx
git commit -m "feat: move AI generation to modal"
```

---

### Task 2: Responsive Modal Styling And Release Verification

**Files:**
- Modify: `src/styles.css`
- Modify: `src/styles.test.ts`

**Interfaces:**
- Consumes: `.ai-dialog-backdrop`, `.ai-dialog`, `.ai-dialog-header`, and `.ai-dialog-content` from Task 1.
- Produces: centered desktop dialog, mobile-safe dimensions, scrollable content, and dark-theme parity.

- [ ] **Step 1: Add a failing static responsive-style test**

Extend `src/styles.test.ts`:

```ts
expect(styles).toContain(".ai-dialog-backdrop");
expect(styles).toContain(".ai-dialog");
expect(styles).toMatch(/\.ai-dialog\s*\{[\s\S]*max-height:\s*calc\(100vh - 48px\)/);
expect(styles).toMatch(/\.ai-dialog-content\s*\{[\s\S]*overflow-y:\s*auto/);
expect(styles).toMatch(/@media \(max-width: 900px\)[\s\S]*\.ai-dialog/);
```

- [ ] **Step 2: Run the style test and verify it fails**

Run:

```powershell
npm test -- --run src/styles.test.ts
```

Expected: FAIL because AI modal selectors do not exist.

- [ ] **Step 3: Add restrained modal styling**

Add:

```css
.ai-dialog-backdrop {
  align-items: center;
  background: rgba(15, 23, 42, 0.32);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 24px;
  position: fixed;
  z-index: 80;
}

.ai-dialog {
  background: #ffffff;
  border: 1px solid #cfd8e6;
  border-radius: 8px;
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.25);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  max-height: calc(100vh - 48px);
  width: min(520px, calc(100vw - 48px));
}

.ai-dialog-header {
  align-items: center;
  border-bottom: 1px solid #e6ecf5;
  display: flex;
  justify-content: space-between;
  padding: 14px;
}

.ai-dialog-header button {
  height: 36px;
  padding: 0;
  width: 36px;
}

.ai-dialog-content {
  display: grid;
  gap: 12px;
  overflow-y: auto;
  padding: 14px;
}

.theme-dark .ai-dialog {
  background: #111827;
  border-color: #334155;
  color: #e5e7eb;
}
```

Add mobile constraints inside the existing media query:

```css
.ai-dialog-backdrop {
  padding: 12px;
}

.ai-dialog {
  max-height: calc(100vh - 24px);
  width: calc(100vw - 24px);
}
```

- [ ] **Step 4: Run automated verification**

Run:

```powershell
npm test
npm run build
git diff --check
```

Expected: all tests pass, build exits zero, and no whitespace errors are reported.

- [ ] **Step 5: Inspect desktop and mobile UI**

Start or reuse the local dev server:

```powershell
npm run dev
```

Verify at `1000x800` and `390x844`, in light and dark themes:

- AI is visible between Outline and Properties.
- Properties has Edit, Import, Export, and Wiki tabs with no AI tab.
- The dialog is centered and fully inside the viewport.
- Inputs, close control, status, and Generate button do not overlap.
- The page has no horizontal overflow.
- Escape, backdrop, success, and error behavior match Task 1.

- [ ] **Step 6: Commit styling**

```powershell
git add src/styles.css src/styles.test.ts
git commit -m "style: add responsive AI modal"
```
