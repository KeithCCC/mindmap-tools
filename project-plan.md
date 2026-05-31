# Mindmap Brainstorming React Utility Plan

## Summary
Build a standalone React browser app for brainstorming ideas as a mindmap. The app lets users create and edit a hierarchical map, import/export semantic mindmap data with Mermaid and Excalidraw, and convert the map into a local LLM Wiki as linked Markdown files.

## Implementation Scope
- Scaffold a Vite React TypeScript app.
- Add a canonical mindmap model with pure tree operations.
- Add Mermaid, Excalidraw, and Markdown wiki conversion modules.
- Add local browser persistence with `localStorage`.
- Add a compact editor UI with import/export and wiki preview controls.
- Add unit and UI tests for the core workflows.

## Public Interfaces
- `parseMermaidMindmap(source: string): ImportExportResult`
- `serializeMermaidMindmap(document: MindmapDocument): string`
- `parseExcalidrawMindmap(json: unknown): ImportExportResult`
- `serializeExcalidrawMindmap(document: MindmapDocument): object`
- `generateWikiMarkdown(document: MindmapDocument): WikiFile[]`

## Testing
- Unit tests cover tree operations, Mermaid conversion, Excalidraw conversion, and wiki generation.
- UI tests cover node creation/editing and Mermaid import.
- Build verification confirms the app compiles for production.

## Assumptions
- v1 is a standalone browser app.
- Format interchange is semantic rather than pixel-perfect.
- Wiki generation is deterministic and offline.
