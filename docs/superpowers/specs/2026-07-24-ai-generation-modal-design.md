# AI Generation Modal Design

## Goal

Make AI mindmap generation easy to discover by moving its entry point out of the Properties tabs and into the main toolbar.

## Scope

This change includes:

- A persistent `AI` button in the main toolbar between `Outline` and `Properties`.
- Removal of the `AI` tab from the Properties tab list.
- A centered modal containing the existing AI generation form and status.
- Responsive modal behavior on desktop and mobile.
- Automated interaction and regression tests.

This change does not alter:

- The AI request or response contract.
- OpenAI model or server configuration.
- Generated-map validation and limits.
- Map replacement or Undo behavior.
- Other Properties tabs.

## User Experience

The toolbar displays `AI` regardless of whether Properties is open. Selecting it opens a centered modal over the editor. The modal contains the existing `Theme`, `Additional instructions`, and `Generate mindmap` controls.

The user can close an idle modal by:

- Selecting its close button.
- Pressing `Escape`.
- Selecting the backdrop.

While generation is running, duplicate submission and modal dismissal are disabled. This prevents an in-progress operation from becoming visually detached from its loading state.

On successful generation, the modal closes automatically and the generated map becomes visible. The existing Undo command restores the previous map. On validation or request failure, the modal remains open and displays the existing error message.

## Layout

The `AI` toolbar button follows the visual treatment and dimensions of neighboring toolbar commands.

The modal uses the existing backdrop and dialog patterns where possible. It has:

- A compact `AI mindmap` heading.
- A familiar close icon button with an accessible label.
- The existing form fields and status area.
- A constrained desktop width.
- A mobile width that remains within the viewport.
- A scrollable content region when vertical space is limited.

The dialog must not overlap controls incoherently or cause horizontal page overflow.

## State And Data Flow

`src/App.tsx` continues to own the existing AI form and generation state. A new modal-open state controls visibility.

1. The toolbar AI button opens the modal.
2. The existing form validates and submits the request.
3. While pending, generation and dismissal controls are disabled.
4. Failure updates the existing status and leaves the modal open.
5. Success commits the generated document through the existing Undo-aware path, then closes the modal.

Closing and reopening the modal preserves the current theme and additional instructions during the page session. No additional persistence is introduced.

## Accessibility

- The modal uses `role="dialog"` and `aria-modal="true"`.
- The dialog has an accessible title.
- The close icon has an accessible label.
- The toolbar AI button exposes its visible `AI` name.
- Keyboard dismissal uses `Escape` only when generation is idle.
- Backdrop clicks close the dialog only when generation is idle.

## Testing

Tests are updated before production code. They cover:

- AI no longer appearing as a Properties tab.
- The toolbar AI button opening the modal when Properties is shown or hidden.
- Close button, backdrop, and `Escape` dismissal.
- Dismissal being blocked during generation.
- Successful generation closing the modal and retaining Undo behavior.
- Failed generation keeping the modal open with its error.
- The existing duplicate-submission protection.

Verification includes the focused UI tests, the full Vitest suite, the production build, and desktop/mobile browser inspection.
