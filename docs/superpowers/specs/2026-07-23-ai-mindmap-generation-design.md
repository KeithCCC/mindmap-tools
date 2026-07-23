# AI Mindmap Generation Design

## Goal

Add an AI-assisted workflow that generates a complete mindmap from a required theme and optional additional instructions. A successful generation replaces the current map while preserving the previous map in the existing undo history.

## Scope

The feature includes:

- A new AI tab in the existing property inspector.
- A required theme field and optional additional-instructions field.
- A server-side OpenAI Responses API integration.
- Structured Outputs for predictable semantic mindmap data.
- Replacement of the current map only after a successful response.
- Error, loading, and success states.
- Automated tests, build verification, and one live API smoke test.

The feature does not include:

- Streaming partial nodes into the editor.
- Editing or expanding only the selected node.
- Saving multiple generated alternatives.
- Model selection in the UI.
- Exposing the OpenAI API key to the browser.

## User Experience

The property inspector gains an `AI` tab alongside the existing Edit, Import, Export, and Wiki tabs.

The tab contains:

- `Theme`: a required single-line input.
- `Additional instructions`: an optional multiline input.
- `Generate mindmap`: the generation command.
- An inline status area for loading, success, and errors.

The Generate button is disabled while a request is running to prevent duplicate submissions. A failed request leaves the current map unchanged. A successful request replaces the current map, and the existing Undo action restores the previous map.

The generated language follows the language used in the theme and additional instructions. If the additional instructions specify the desired map size, the model follows them. If no size is specified, the default target is at most three levels with at most four child items per node.

The request accepts a theme of up to 200 characters and additional instructions of up to 2,000 characters. Generated maps are limited to 250 total nodes, six levels, and 12 children per node. Results outside these safety limits are rejected without changing the current map.

## Architecture

### Client

`src/App.tsx` owns the AI tab state and request lifecycle, following the existing property-inspector pattern. It sends the theme and optional instructions to the server, converts the successful semantic response into a `MindmapDocument`, and applies it through the existing document commit path so undo history remains intact.

The client generates application-owned values such as node IDs, document ID handling, and timestamps. The model does not generate these values.

### Server

The Express server adds:

`POST /api/ai/generate-mindmap`

Request:

```json
{
  "theme": "New business",
  "instructions": "Include risks and milestones"
}
```

Successful response:

```json
{
  "mindmap": {
    "title": "New business",
    "body": null,
    "children": []
  }
}
```

The server uses the official OpenAI Node SDK and the Responses API. `OPENAI_API_KEY` remains server-side. The server supplies a strict JSON Schema through Structured Outputs and validates the parsed result before returning it.

OpenAI-specific request construction and response parsing live in a focused server module rather than directly inside the Express route. This keeps API behavior independently testable.

### Generated Data

The model returns semantic nodes only:

```ts
type GeneratedMindmapNode = {
  title: string;
  body: string | null;
  children: GeneratedMindmapNode[];
};
```

All fields are required by the Structured Outputs schema. Optional notes use `string | null`. Objects reject unspecified properties.

The client recursively converts these nodes to the existing `MindmapNode` shape, assigning fresh node IDs. It preserves the current document identity and creation timestamp, updates the document title and root title from the generated root, and sets a new update timestamp.

## Data Flow

1. The user enters a theme and optional instructions.
2. The client rejects an empty theme without sending a request.
3. The client enters a loading state and disables generation.
4. The server validates the request.
5. The server calls the OpenAI Responses API with the Structured Outputs schema.
6. The server handles refusal, incomplete output, API errors, and invalid parsed data.
7. The server returns a validated semantic mindmap.
8. The client assigns IDs and document metadata.
9. The client applies the replacement through the existing undo-aware commit path.
10. The UI reports success and re-enables generation.

## Error Handling

The current map is never changed unless the complete generated response has been accepted.

The server distinguishes:

- Invalid or empty input: HTTP 400.
- Missing server API key: HTTP 503.
- OpenAI rate-limit or quota response: HTTP 429.
- Model refusal, incomplete output, or generated data outside the accepted limits: HTTP 422.
- OpenAI authentication or other upstream failure: HTTP 502.
- Unexpected server failure: HTTP 500 with a generic client message.

The browser receives a concise actionable message but never receives the API key or raw upstream diagnostic details. Server logs must not include credentials.

## Cost, Performance, and Risk

- The request uses one Responses API call per generation.
- Theme and instruction lengths use the documented request limits, generated data uses the documented structural limits, and the API request uses a 6,000 output-token cap.
- Duplicate submissions are blocked while a request is active.
- A fixed schema keeps parsing predictable and reduces retry requirements.
- A new schema may add latency on its first use.
- Structured Outputs guarantees shape, not factual accuracy or usefulness; generated content remains user-reviewable.
- Replacement is recoverable through Undo, reducing accidental data-loss risk.

## Testing

Tests are written before production changes.

Server-focused tests cover:

- Rejecting an empty theme.
- Building the Responses API request with strict Structured Outputs.
- Parsing and validating a successful generated mindmap.
- Handling refusals, incomplete output, and invalid output.
- Returning sanitized errors without exposing upstream secrets.

Client tests cover:

- Rendering the AI tab and fields.
- Preventing submission without a theme.
- Disabling generation during an active request.
- Replacing the current map after success.
- Restoring the previous map with Undo.
- Preserving the current map after failure.

Completion verification includes:

- The focused new tests.
- The full Vitest suite.
- The TypeScript and Vite production build.
- One live API smoke test using the configured local key without printing the key or generated content.
