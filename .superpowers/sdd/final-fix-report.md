## 2026-07-23 Final whole-feature review fixes

### Scope

- Correct non-completed OpenAI response status handling.
- Disable SDK retries and enforce a 120,000 ms request timeout.
- Lock the router's known-error HTTP status.
- Isolate the default model test and retain the approved `OPENAI_MODEL` operational override.
- No model-selection UI, live OpenAI request, authentication/rate limiting, dependency remediation, or unrelated changes.

### RED evidence

1. Initial sandbox attempt:
   - Command: `npx vitest run server/openaiMindmap.test.ts server/aiMindmapRouter.test.ts`
   - Result: exit 1 before test collection because Vite/esbuild could not spawn (`Error: spawn EPERM`).
2. Focused RED rerun with process-spawn permission:
   - Command: `npx vitest run server/openaiMindmap.test.ts server/aiMindmapRouter.test.ts`
   - Result: exit 1; 1 test file failed, 1 passed; 6 tests failed, 11 passed.
   - Expected failures: missing `OPENAI_CLIENT_OPTIONS`, plus `failed`, `cancelled`, `queued`, `in_progress`, and unexpected statuses returning 422 `incomplete_output` instead of 502 `openai_upstream_error`.

### GREEN evidence

1. Focused GREEN after the minimal implementation:
   - Command: `npx vitest run server/openaiMindmap.test.ts server/aiMindmapRouter.test.ts`
   - Result: exit 0; 2 test files passed; 17 tests passed.
2. Focused GREEN after test cleanup:
   - Command: `npx vitest run server/openaiMindmap.test.ts server/aiMindmapRouter.test.ts`
   - Result: exit 0; 2 test files passed; 17 tests passed.
3. Node TypeScript:
   - Command: `npx tsc -p tsconfig.node.json`
   - Result: exit 0; no output.
4. Full test suite:
   - Command: `npm test`
   - Result: exit 0; 13 test files passed; 86 tests passed.
5. Production build:
   - Command: `npm run build`
   - Result: exit 0; TypeScript build passed; Vite transformed 38 modules and completed the production build.
6. Diff validation:
   - Command: `git diff --check`
   - Result: exit 0; no whitespace errors. Git emitted only LF-to-CRLF working-copy warnings for the three modified TypeScript files.

### Files changed

- `server/openaiMindmap.ts`
- `server/openaiMindmap.test.ts`
- `server/aiMindmapRouter.test.ts`
- `.superpowers/sdd/final-fix-report.md`

`shared/aiMindmap.ts` was reviewed and did not require a change.

### Self-review

- `incomplete` maps to sanitized 422 `incomplete_output`.
- `failed`, `cancelled`, `queued`, `in_progress`, and unexpected non-completed statuses map to sanitized 502 `openai_upstream_error`.
- A completed response with no output retains the existing sanitized 422 behavior.
- `OPENAI_CLIENT_OPTIONS` locks `maxRetries: 0` and `timeout: 120_000`, and the production client applies those values.
- The default-model test restores the prior environment state; the operational override remains supported in a separate test.
- The router test explicitly asserts the known error's 502 status.
- Tests use injected gateways or exported configuration and make no live OpenAI call.

### Concerns

- No functional concerns found.
- The full and focused suites retain an intentional stderr line (`Mindmap generation failed`) while testing the unknown-error route.
- Git reports working-copy LF-to-CRLF normalization warnings, but `git diff --check` reports no errors.
