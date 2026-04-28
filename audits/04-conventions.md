# Convention Adherence Audit

Date: 2026-04-28. Source of truth: [AGENTS.md](../AGENTS.md). Follows the Step-4 plan in [plans/plan-codeOverview.prompt.md](../plans/plan-codeOverview.prompt.md).

This audit verifies that the Klip codebase conforms to its documented conventions. Headline: **the codebase is largely compliant**. 21 of 26 audited surfaces came back CLEAN. Findings cluster around three real architectural deviations and a backlog of ESLint convention errors.

---

## Compliance summary

| #   | Surface                                              | AGENTS.md                      | Result                                                                                                                                                                                                                                                                                 |
| --- | ---------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Domain purity (no external deps in `domain/`)        | [L373](../AGENTS.md#L373)      | ✅ CLEAN                                                                                                                                                                                                                                                                               |
| 2   | Use-case dependency inversion                        | [L372](../AGENTS.md#L372)      | ✅ CLEAN                                                                                                                                                                                                                                                                               |
| 3   | IPC isolation (`ipcMain` only in controllers)        | [L374](../AGENTS.md#L374)      | ❌ [F1](#f1--high--ipc-isolation-violation)                                                                                                                                                                                                                                            |
| 4   | Audited mutations at consumers                       | [L381](../AGENTS.md#L381)      | ✅ CLEAN                                                                                                                                                                                                                                                                               |
| 5   | Composition root pattern                             | [L377](../AGENTS.md#L377)      | ❌ [F2](#f2--medium--composition-root-violation-bootstrap-leak)                                                                                                                                                                                                                        |
| 6   | Hard-delete absence in reconcile                     | [L378](../AGENTS.md#L378)      | ✅ CLEAN                                                                                                                                                                                                                                                                               |
| 7   | Operations safety net                                | [L382](../AGENTS.md#L382)      | ✅ CLEAN                                                                                                                                                                                                                                                                               |
| 8   | Audited mutations all wrapped in `transaction.run()` | [L381](../AGENTS.md#L381)      | ✅ CLEAN                                                                                                                                                                                                                                                                               |
| 9   | Sort-column allowlists                               | [L380](../AGENTS.md#L380)      | ✅ CLEAN                                                                                                                                                                                                                                                                               |
| 10  | Tags JSON serialization                              | [L379](../AGENTS.md#L379)      | ✅ CLEAN (with [F8](#f8--low--agentsmd-doc-gap-videotags-not-documented) doc gap)                                                                                                                                                                                                      |
| 11  | Entity lifecycle (`active`/`deleted`/`missing`)      | [L378](../AGENTS.md#L378)      | ✅ CLEAN                                                                                                                                                                                                                                                                               |
| 12  | Slim renderer (no SQL/path/fs/electron)              | [L375](../AGENTS.md#L375)      | ✅ CLEAN                                                                                                                                                                                                                                                                               |
| 13  | shadcn-first construction                            | [L390-396](../AGENTS.md#L390)  | ✅ CLEAN                                                                                                                                                                                                                                                                               |
| 14  | Path aliases (no deep relative paths)                | [L308-322](../AGENTS.md#L308)  | ✅ CLEAN                                                                                                                                                                                                                                                                               |
| 15  | Hook naming (`use-xxx.ts` → `useXxx()`)              | observed convention            | ✅ CLEAN                                                                                                                                                                                                                                                                               |
| 16  | Query keys centralized                               | observed convention            | ✅ CLEAN                                                                                                                                                                                                                                                                               |
| 17  | `window.api` typing                                  | [L375](../AGENTS.md#L375)      | ✅ CLEAN                                                                                                                                                                                                                                                                               |
| 18  | Test factory usage                                   | [L499](../AGENTS.md#L499)      | ✅ CLEAN (with [F9](#f9--low-discussion--test-factory-duplication) discussion item)                                                                                                                                                                                                    |
| 19  | `createTestDb` for DB tests                          | [L498](../AGENTS.md#L498)      | ✅ CLEAN                                                                                                                                                                                                                                                                               |
| 20  | `vi.fn()` mock pattern                               | observed convention            | ✅ CLEAN                                                                                                                                                                                                                                                                               |
| 21  | Test mirror layout                                   | [L497](../AGENTS.md#L497)      | ✅ CLEAN                                                                                                                                                                                                                                                                               |
| 22  | `: any` / `as any` in handwritten code               | TS discipline                  | ✅ CLEAN                                                                                                                                                                                                                                                                               |
| 23  | `as unknown as` justification                        | TS discipline                  | ✅ CLEAN                                                                                                                                                                                                                                                                               |
| 24  | Non-null assertions (`!.`)                           | TS discipline                  | ✅ CLEAN (zero sites)                                                                                                                                                                                                                                                                  |
| 25  | `@ts-ignore` / `@ts-expect-error`                    | TS discipline                  | ✅ CLEAN                                                                                                                                                                                                                                                                               |
| 26  | ESLint convention errors                             | codeOverview success criterion | ❌ [F3](#f3--high--react-ref-mutation-during-render) [F4](#f4--medium--explicit-function-return-type-backlog) [F5](#f5--medium--react-refreshonly-export-components-blocks-hmr) [F6](#f6--low--test-lint-debt-unused-vars--explicit-any) [F7](#f7--low--reactprop-types-misconfigured) |

---

## Findings

### F1 — HIGH — IPC isolation violation

**Rule:** [AGENTS.md L374](../AGENTS.md#L374) — _"IPC Handlers in `interface-adapters/controllers` are the only place allowed to use `ipcMain.handle`."_ (extends to `ipcMain.on` for the same reason — IPC concerns belong in controllers.)

**Verification:** `Grep "ipcMain\.(handle|on)" src/main/`

**Sites:**

- [src/main/index.ts:74](../src/main/index.ts#L74) — `ipcMain.on('ping', () => console.log('pong'))`

**Description:** Stray `ping` handler from the electron-vite scaffold template. Not a real feature. Outside the controllers/ folder, so violates the IPC-isolation rule. Also pollutes `console.log` with `pong` on every renderer ping.

**Suggested fix:** Delete the line.

---

### F2 — MEDIUM — Composition root violation (bootstrap leak)

**Rule:** [AGENTS.md L377](../AGENTS.md#L377) + [L264-298](../AGENTS.md#L264) — _"Concrete infrastructure (DB, File Watcher, APIs) must never be instantiated [outside composition-root.ts]."_

**Verification:** `Grep "new (Sqlite\w+Repository|YtDlp\w+|Ffprobe\w+|Chokidar\w+|Node\w+|Electron\w+|PQueue\w+|Audited\w+|SqliteTransactionScope)\(" src/`

**Sites:**

- [src/main/index.ts:88](../src/main/index.ts#L88) — `const settingsRepo = new SqliteSettingsRepository(database.db)`

**Description:** A bootstrap chicken-and-egg: index.ts must read `rootPath` from settings before it can construct the `AppContainer` (since `AppConfig` requires `rootPath`). It opens a partial `SqliteSettingsRepository` directly to do this. Functionally correct but breaks the rule that _only_ composition-root.ts instantiates concrete infrastructure.

**Severity rationale:** MEDIUM, not HIGH. The bootstrap is small (one repo, read-only access), and the "always pass dependencies as interfaces" invariant elsewhere in the app is intact. But it's the kind of crack that grows over time if uncorrected.

**Suggested fix:** Move root-path resolution _inside_ `createAppContainer` and have `AppConfig` accept a `defaultRootPath` instead of a resolved `rootPath`. The container then reads/persists `rootPath` from `settingsRepo` itself before any other dependency needs it. index.ts ends up doing only `initializeDatabase` + `createAppContainer({ database, defaultRootPath, isDev })`.

---

### F3 — HIGH — React ref mutation during render

**Rule:** ESLint `react-hooks/refs` — refs cannot be mutated during render (React 19 rule; behavioral concern, not just style).

**Verification:** `npm run lint` reports 1 site.

**Sites:**

- [src/renderer/src/routes/\_\_root.tsx:46](../src/renderer/src/routes/__root.tsx#L46) — `installRef.current = installUpdate` inside `UpdaterToastWatcher` render body.

**Description:** The component holds the latest `installUpdate` mutation object in a ref so the effect's deps don't change every render (TanStack Query returns a new mutation object per render). The intent is correct, but **mutating `ref.current` during render is a React 19 rule violation** — refs should only be read/written from event handlers or effects. The current code can produce stale-closure or render-loop issues in concurrent mode.

**Severity rationale:** HIGH because it's a real behavioral bug surfaced as a lint convention error. Counts as a Step 2 (weird-logic) miss caught here.

**Suggested fix:** Wrap the assignment in `useEffect`:

```tsx
useEffect(() => {
  installRef.current = installUpdate
})
```

…or sidestep the ref entirely if `useInstallUpdate()` exposes a stable `mutate` — destructure `mutate` directly and add it to the `useEffect` deps without churn.

---

### F4 — MEDIUM — `explicit-function-return-type` backlog

**Rule:** ESLint `@typescript-eslint/explicit-function-return-type` (inherited via `@electron-toolkit/eslint-config-ts`).

**Verification:** `npm run lint` reports **352 errors**.

**Sites:** Distributed across:

- `src/renderer/hooks/*.ts` (~28 errors across all 12 hook files)
- `src/renderer/lib/{format,utils}.ts` (2 errors)
- `src/renderer/src/routes/*.tsx` (~25 errors across all 8 routes)
- `src/renderer/components/{shared,features}/**/*.tsx` (~290 errors across all renderer components, where the count concentrates)
- `tests/main/use-cases/MigrateRootFolder.test.ts` (2 errors, in test files)
- `tests/renderer/helpers/test-utils.tsx:35` (1 error)

**Description:** The toolkit's TS preset enforces explicit return types on every exported function. The renderer is the largest gap because most React components return JSX inferred (no annotation). codeOverview success criterion: → 0 in non-test files.

**Suggested fix:** Mechanical sweep — annotate every renderer component as `(): JSX.Element` (or `React.ReactElement` / `React.FC<Props>` per repo style), every hook with its TanStack Query return type, every utility with its output type. Roughly ~330 sites in non-test files; can be done with a mass edit and verified by `npm run lint`. Test-file return types (3 sites) can either be fixed or scoped via an ESLint override on `tests/**`.

---

### F5 — MEDIUM — `react-refresh/only-export-components` (blocks HMR)

**Rule:** ESLint `react-refresh/only-export-components` (Vite preset). Files that mix component exports with utility/constant exports break Fast Refresh.

**Verification:** `npm run lint` reports **9 errors**.

**Sites (3 files cluster the bulk):**

- [src/renderer/components/features/videos/CommentsTab.tsx:302](../src/renderer/components/features/videos/CommentsTab.tsx#L302) — exports a utility + a component
- [src/renderer/components/theme-provider.tsx:65](../src/renderer/components/theme-provider.tsx#L65), [L67](../src/renderer/components/theme-provider.tsx#L67) — `useTheme` hook exported alongside `ThemeProvider`
- Files with badge variants / config exports (3 occurrences flagged at L45, L78:62, L80:52 in shared UI primitives)
- 2 more sites in feature components (L270:3, L668:3)

**Description:** Each violation breaks Fast Refresh for that file. Edit a component, get a full reload instead of a hot replacement.

**Suggested fix:** Move utilities/constants/hooks out of component files into separate sibling files (e.g., `theme-provider.tsx` → `theme-provider.tsx` + `use-theme.ts`). Mechanical, file-by-file.

---

### F6 — LOW — Test lint debt (unused vars, explicit any)

**Verification:** `npm run lint`.

**Sites:**

- 3× `_previous` unused param in [SqliteCreatorRepository.ts:100](../src/main/interface-adapters/repositories/SqliteCreatorRepository.ts#L100), [SqliteVideoRepository.ts:151](../src/main/interface-adapters/repositories/SqliteVideoRepository.ts#L151), [SqliteCutRepository.ts:206](../src/main/interface-adapters/repositories/SqliteCutRepository.ts#L206) — the `upsertWithPrevious(entity, _previous)` signature shipped in Audit-03's M1 fix; the `_` prefix isn't being honored by the toolkit's no-unused-vars rule because `argsIgnorePattern` isn't configured.
- 3× `_prev` in [tests/main/use-cases/ReconcileDirectory.test.ts:96,113,133](../tests/main/use-cases/ReconcileDirectory.test.ts#L96)
- 1× `screen` in [tests/renderer/components/features/settings/RootPathDisplay.test.tsx:2](../tests/renderer/components/features/settings/RootPathDisplay.test.tsx#L2)
- 1× `_` in [src/renderer/src/routes/\_\_root.tsx:43](../src/renderer/src/routes/__root.tsx#L43)
- 1× `as any` in [tests/renderer/components/features/settings/MigrateRootButton.test.tsx:14](../tests/renderer/components/features/settings/MigrateRootButton.test.tsx#L14)

**Description:** 9 lint errors, all clearly intent-marked (underscore-prefix or test scaffolding). The toolkit's preset doesn't honor the `_` convention out of the box.

**Suggested fix:** Either (a) configure `argsIgnorePattern: '^_'` and `varsIgnorePattern: '^_'` in [eslint.config.mjs](../eslint.config.mjs) — single-config change, eliminates all 5 underscore errors at once and keeps the convention going forward; or (b) delete the unused params/imports. Option (a) is preferred because the underscore-prefix-means-intentional convention is widespread and signals reader intent. The 1× `as any` in test should be typed; `screen` import should be removed.

---

### F7 — LOW — `react/prop-types` misconfigured

**Rule:** ESLint `react/prop-types` (from eslint-plugin-react's recommended preset).

**Verification:** `npm run lint` reports **4 errors**, all in one file at lines 114-117 (likely a shadcn `ScrollArea`-adjacent primitive — flagged for `className`, `rootRef`, `orientation` props).

**Description:** `react/prop-types` validates runtime PropTypes, which is **not relevant for TypeScript** — TS handles prop validation at compile time. The rule is enabled because [eslint.config.mjs:11](../eslint.config.mjs#L11) imports `eslintPluginReact.configs.flat.recommended` without overriding it.

**Suggested fix:** Disable in [eslint.config.mjs](../eslint.config.mjs):

```js
{
  rules: {
    'react/prop-types': 'off'  // TS already validates props
  }
}
```

This is a one-line config change that resolves all 4 errors at once and prevents future false positives.

---

### F8 — LOW — AGENTS.md doc gap (Video.tags not documented)

**Rule:** [AGENTS.md L379](../AGENTS.md#L379) documents tags JSON serialization for `Cut.tags` but is silent on `Video.tags`.

**Verification:** Reading [SqliteVideoRepository.ts:107](../src/main/interface-adapters/repositories/SqliteVideoRepository.ts#L107) shows `tags: JSON.stringify(video.tags ?? [])` — same pattern as Cut, also un-tested by the docs.

**Description:** The code is correct (Video has the same JSON serialization treatment). AGENTS.md is the doc that's stale.

**Suggested fix:** Update AGENTS.md L379 to read approximately:

> **Tags JSON Serialization**: `Cut.tags` and `Video.tags` are `string[]` in the domain entity but stored as JSON `TEXT` columns in SQLite. On **write**, use `JSON.stringify(entity.tags)`. On **read**, parse via `JSON.parse(row.tags as string)`. Tag-based queries use SQLite's `json_each()` via Drizzle's `sql` template (see `SqliteCutRepository.findByTags`).

---

### F9 — LOW (discussion) — Test factory duplication

**Verification:** `Grep "function makeCreator|function makeVideo|function makeCut" tests/`

**Description:** Each test file defines its own local `makeCreator()` / `makeVideo()` / `makeCut()` helpers (e.g., [tests/main/use-cases/ReconcileDirectory.test.ts:9-60](../tests/main/use-cases/ReconcileDirectory.test.ts#L9), repeated in [DownloadVideo.test.ts](../tests/main/use-cases/DownloadVideo.test.ts), [AuditedCreatorRepository.test.ts](../tests/main/interface-adapters/repositories/AuditedCreatorRepository.test.ts), etc.).

[AGENTS.md L499](../AGENTS.md#L499) says "use factory functions" but is silent on whether they should be centralized. So this is a **style discussion**, not a strict violation.

**Tradeoff:** local factories are easy to read in-test (the defaults are visible) and don't introduce a cross-test coupling. A centralized factory module (e.g., `tests/main/helpers/factories.ts`) would reduce duplication but make per-test default tweaking awkward.

**Recommendation:** Keep as-is. The convention "factory functions are required, location is flexible" is already what the codebase does. Optional: add a one-line note to AGENTS.md L499 documenting this preference so the next contributor doesn't feel torn.

---

## Verified clean (audit log)

For each surface below, the verification was performed and produced no findings. This list is the baseline against which future audits can detect drift.

- **Domain purity** — `Grep "from '(better-sqlite3|drizzle-orm|chokidar|fs|path|node:|electron)'" src/main/domain` → only a JSDoc comment match in [IPathResolver.ts:3](../src/main/domain/ports/IPathResolver.ts#L3) (intentionally documenting _why_ the port exists). Zero real imports.
- **Use-case dependency inversion** — same grep against `src/main/use-cases` → zero matches. Use-cases import only from `@domain/*`, `@shared/*`, and other use-cases.
- **Audited mutations at consumers** — `Grep "Sqlite(Creator|Video|Cut)Repository" src/` → only inside `composition-root.ts` (instantiation) and `interface-adapters/repositories/index.ts` (re-export). External consumers all bind to `Audited*Repository` decorators.
- **Hard-delete in reconcile** — `Grep "\.delete\(" src/main/use-cases/ReconcileDirectory.ts` → 2 matches at L276 and L381, **both on `Set` instances** (`diskVideoIds.delete(video.id)` and `diskCutIds.delete(cut.id)`), not on repos. Reconciliation correctly uses `updateStatus(..., 'missing', ...)` for disappeared entities (verified at 12 call sites in the file).
- **Operations safety net** — [MigrateRootFolder.ts:105-114](../src/main/use-cases/MigrateRootFolder.ts#L105) writes the `migrate_root` operation row with `status: 'in_progress'` _before_ any FS work (folder moves begin at L130). Payload checkpoints are written after each move (L133). Inline rollback on partial failure restores prior state and marks operation failed.
- **Audited mutations all wrapped** — All 3 `Audited*Repository.ts` decorators wrap every mutation method (`upsertWithPrevious`, `updateStatus`, `updateProbeStatus` on Video/Cut, `delete`, `updateFilePathPrefix` on Video/Cut) inside `this.transaction.run(...)`. Reads delegate directly. Verified by structural read of all 3 files.
- **Sort-column allowlists** — [SqliteCreatorRepository.ts:13-20](../src/main/interface-adapters/repositories/SqliteCreatorRepository.ts#L13), [SqliteVideoRepository.ts:13-25](../src/main/interface-adapters/repositories/SqliteVideoRepository.ts#L13), [SqliteCutRepository.ts:13-23](../src/main/interface-adapters/repositories/SqliteCutRepository.ts#L13) all define `SORT_COLUMNS: Record<string, SQLiteColumn>` with `DEFAULT_SORT_COLUMN` fallback. `findPaginated` uses `SORT_COLUMNS[params.sortBy ?? ''] ?? DEFAULT_SORT_COLUMN` — no string interpolation of user input.
- **Tags JSON serialization** — [SqliteCutRepository.ts:168](../src/main/interface-adapters/repositories/SqliteCutRepository.ts#L168) writes `JSON.stringify(cut.tags)`; [L27-35](../src/main/interface-adapters/repositories/SqliteCutRepository.ts#L27) parses with `JSON.parse` in `parseTags` helper. `findByTags` uses Drizzle's `sql` template + `json_each` ([L120-136](../src/main/interface-adapters/repositories/SqliteCutRepository.ts#L120)). Same pattern verified for `Video.tags` (see [F8](#f8--low--agentsmd-doc-gap-videotags-not-documented)).
- **Entity lifecycle** — `EntityStatus` is `'active' | 'deleted' | 'missing'` and used consistently across all entity repositories and reconciliation. Reconcile only writes `'missing'`; explicit user delete paths in controllers write `'deleted'`. Spot-checked across `ReconcileDirectory`, `Audited*Repository`, and controllers.
- **Slim renderer** — `Grep "from '(better-sqlite3|drizzle-orm|fs|path|node:|electron)'" src/renderer` → zero matches. No raw SQL strings either.
- **shadcn-first construction** — Spot-checked [CreatorCard.tsx](../src/renderer/components/features/creators/CreatorCard.tsx), [UrlInput.tsx](../src/renderer/components/features/downloads/UrlInput.tsx), [RootPathDisplay.tsx](../src/renderer/components/features/settings/RootPathDisplay.tsx), [DownloadProgressCard.tsx](../src/renderer/components/features/downloads/DownloadProgressCard.tsx) — all compose shadcn primitives + Tailwind, no raw `<div>` for things shadcn covers.
- **Path aliases** — `Grep "\.\./\.\./\.\./" src/renderer` → zero matches. All cross-folder imports use `@/`, `@components/`, `@renderer/`, `@shared/`, `@ui/`.
- **Hook naming** — All 12 files in [src/renderer/hooks/](../src/renderer/hooks/) follow `use-xxx.ts` (kebab-case file) → `useXxx()` (camelCase function) convention.
- **Query keys centralized** — [src/renderer/lib/query-keys.ts](../src/renderer/lib/query-keys.ts) defines a `queryKeys` object covering all 7 entity domains (creators, videos, cuts, settings, auditLog, operations, updater). All renderer hooks reference it; no inline `queryKey: ['something', id]` arrays found.
- **`window.api` typing** — `Grep "window\.api as any" src/renderer` → zero matches. The preload bridge ([src/preload/index.d.ts:90-95](../src/preload/index.d.ts#L90)) declares a fully-typed `KlipAPI` global.
- **Test factory usage** — All use-case and repository tests use `makeCreator()/makeVideo()/makeCut()`-style factories with `Partial<Entity>` overrides; no raw inline-literal entity construction. (See [F9](#f9--low-discussion--test-factory-duplication) on centralization.)
- **`createTestDb` for DB tests** — All DB-touching tests import [tests/main/helpers/createTestDb.ts](../tests/main/helpers/createTestDb.ts) and call `raw.close()` in `afterEach`. No direct `better-sqlite3` instantiations in tests.
- **`vi.fn()` mock pattern** — Use-case tests construct mock repos inline as `{ findById: vi.fn(), upsert: vi.fn(), ... }`. Pattern is consistent across all tests.
- **Test mirror layout** — Spot-checked 3 source/test pairs (`ReconcileDirectory`, `SqliteCreatorRepository`, `CreatorCard`). All present at mirrored paths.
- **`: any` / `as any` in handwritten code** — `Grep "(: any\b|as any\b)" src/` → 6 matches in [routeTree.gen.ts](../src/renderer/src/routeTree.gen.ts) (auto-generated, out of scope) + 1 in test (see [F6](#f6--low--test-lint-debt-unused-vars--explicit-any)). **Zero in handwritten production code.**
- **`as unknown as` justification** — 3 sites in [AuditedCreatorRepository.ts:64-65](../src/main/interface-adapters/repositories/AuditedCreatorRepository.ts#L64), [AuditedVideoRepository.ts:66-67](../src/main/interface-adapters/repositories/AuditedVideoRepository.ts#L66), [AuditedCutRepository.ts:70-71](../src/main/interface-adapters/repositories/AuditedCutRepository.ts#L70) — all bridging `Entity` → `Record<string, unknown>` for the audit-diff helper. **Justified**: the diff helper is intentionally schema-agnostic, and the cast is a one-line localized boundary.
- **Non-null assertions** — `Grep "!\\." src/` → zero handwritten sites.
- **`@ts-ignore`** — 2 sites in [src/preload/index.ts:116,119](../src/preload/index.ts#L116) for the context-isolation fallback path. Acceptable per Electron preload patterns.

---

## AGENTS.md doc-gap meta-findings

Captured here so the AGENTS.md update lands as part of the fix pass.

- **F8 above:** L379 should mention `Video.tags` alongside `Cut.tags`.
- **(optional, F9)** L499 could note "factory functions may be defined locally per test file or centralized; pick whichever keeps each test readable" — not strictly necessary, but would close a small gap of contributor confusion.

---

## Fix sequencing (recommended)

Order matters because some fixes change the lint baseline used by later ones.

| #   | Finding                                                                                                                            | Severity | Effort | Notes                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| 1   | [F1](#f1--high--ipc-isolation-violation) — delete `ipcMain.on('ping')`                                                             | HIGH     | 1 min  | Trivial; clears one of the structural findings.                                                                   |
| 2   | [F3](#f3--high--react-ref-mutation-during-render) — wrap `installRef.current = ...` in `useEffect`                                 | HIGH     | 5 min  | Real React 19 bug; one-file fix in `__root.tsx`.                                                                  |
| 3   | [F7](#f7--low--reactprop-types-misconfigured) — disable `react/prop-types` in eslint.config                                        | LOW      | 2 min  | Removes 4 false-positive errors before the F4 sweep.                                                              |
| 4   | [F6](#f6--low--test-lint-debt-unused-vars--explicit-any) — configure `argsIgnorePattern: '^_'` + clean up the 2 non-prefixed sites | LOW      | 5 min  | Removes 5 errors. Does this BEFORE F4 so the count is honest.                                                     |
| 5   | [F2](#f2--medium--composition-root-violation-bootstrap-leak) — move root-path resolution into `createAppContainer`                 | MEDIUM   | 30 min | Refactor `AppConfig`; needs care around the in-memory `RootPathRef`. Verify with `npm run dev`.                   |
| 6   | [F5](#f5--medium--react-refreshonly-export-components-blocks-hmr) — split mixed-export files                                       | MEDIUM   | 30 min | 9 sites across 5–6 files; mechanical.                                                                             |
| 7   | [F4](#f4--medium--explicit-function-return-type-backlog) — annotate return types                                                   | MEDIUM   | 1–2 hr | ~330 sites in non-test files (tests can be scoped via overrides). Mass mechanical edit; verify zero errors after. |
| 8   | [F8](#f8--low--agentsmd-doc-gap-videotags-not-documented) — update AGENTS.md L379                                                  | LOW      | 5 min  | Doc tweak.                                                                                                        |
| 9   | [F9](#f9--low-discussion--test-factory-duplication) — discussion item, no code change                                              | LOW      | —      | Decide: keep status quo, or centralize. Default: keep.                                                            |

**Verification gates after fix pass:**

- `npm run typecheck` clean.
- `npm run lint` reports 0 errors (or only test-scoped errors if F4 takes the override route).
- `npm run test` — 618 tests still pass.
- `npm run dev` — F2 + F3 + F5 affect runtime / HMR; smoke-test a download flow and a renderer file edit (HMR should hot-replace, not full-reload).

---

**End of audit.** Triage by marking each F# `fix / defer / reject`, then proceed to the fix phase.
