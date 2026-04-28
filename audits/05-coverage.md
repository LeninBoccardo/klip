# Audit 05 — Test Coverage

Step 5 of [plans/plan-codeOverview.prompt.md](../plans/plan-codeOverview.prompt.md). Goal: identify critical paths with no test, files below the 90 % use-case target ([AGENTS.md L508](../AGENTS.md#L508)), and renderer mutation hooks whose `invalidateQueries` keys are unverified.

**Severity rubric**

| Severity | Bar |
|---|---|
| **HIGH** | Critical path with no test — wrong output for a real user input, or tooling failure that hides drift in CI. |
| **MEDIUM** | Convention-level gap that compounds — a class of unverified behaviour, or coverage-config drift relative to the canonical doc. |
| **LOW** | Defensive note — narrow uncovered branch, or a scenario where blast radius is small. |

**Method note.** Surface A (per-file coverage percentages from `npm run test:coverage`) is **BLOCKED** by F1: the v8 coverage tool fails on every test file (61/61) with `TypeError: Cannot read properties of undefined (reading 'config')`. Plain `npm run test` passes (618/618) — this is a coverage-instrumentation regression, not a test regression. The audit therefore relies on static analysis for surfaces B/C/D and treats unblocking the coverage tool as the first fix-phase task.

---

## Compliance summary

| # | Surface | Status | Severity |
|---|---|---|---|
| **A** | Per-file coverage gaps from `coverage-summary.json` | ⛔ BLOCKED by F1 | HIGH |
| B-8 | `MigrateRootFolder` rollback after partial failure | ✅ CLEAN | — |
| B-9 | `ProcessFileNotifications` suspend / resume lifecycle | ✅ CLEAN (one race uncovered → F5) | LOW |
| B-10 | `RecoverOperations` `OperationStatus` × `OperationType` matrix | ✅ CLEAN | — |
| B-11 | `FetchVideoComments` error-propagation branch | ⚠ FINDING-F6 | LOW |
| B-12 | `CommentsTab` rendering states | ⛔ FINDING-F2 | HIGH |
| C-13–19 | Renderer mutation hooks (10 mutations across 6 hooks) | ⛔ FINDING-F3 | MEDIUM |
| D-20 | Coverage exclusion-list drift (vitest.config.ts vs AGENTS.md L509) | ⚠ FINDING-F4 | MEDIUM |
| D-21 | Excluded-but-testable surface review | ✅ CLEAN | — |

**Tally.** 6 findings: 2 HIGH (F1, F2), 2 MEDIUM (F3, F4), 2 LOW (F5, F6).

---

## Findings

### F1 — Coverage tooling broken across the entire suite — HIGH

**Surface:** [package.json:28](../package.json#L28) `test:coverage` script + [vitest.config.ts:43-82](../vitest.config.ts#L43-L82) coverage block.

**Symptom.** Running `npm run test:coverage` produces:

```
Test Files  61 failed (61)
     Tests  no tests
TypeError: Cannot read properties of undefined (reading 'config')
 ❯ tests/setup/renderer.setup.ts:8:1
       afterEach(() => {
       ^
Vitest failed to find the current suite. One of the following is possible:
- "vitest" is imported directly without running "vitest" command
- "vitest" is imported inside "globalSetup" (...)
```

Every `describe()` block fails at registration time with the same `'config'`-undefined error. Plain `npm run test` (no `--coverage`) passes 618/618. The break is therefore in the v8 instrumentation layer, not the test code.

**Why it matters.** AGENTS.md L519 declares CI runs `npm run test:coverage` (the GitHub Actions workflow does too — [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)). With the coverage step broken, CI either silently fails the coverage gate or reports `0 %` for everything, masking real drift. It also blocks every quantitative surface of this audit (Surface A).

**Likely root cause.** `vitest@4.1.4` + `@vitest/coverage-v8@4.1.4` + `projects` mode interaction. Vitest 4.x is recent (Q1 2026) and v8 instrumentation regressions in projects mode have been reported. The error trace points at `tests/setup/renderer.setup.ts:8` (`afterEach`) but the file is registered as `setupFiles` (not `globalSetup`) — instrumentation appears to be misclassifying it.

**Suggested fix.**

1. First try: bump `@vitest/coverage-v8` to the latest 4.x patch; if a fix landed, no config change is needed.
2. If still broken, switch to `provider: 'istanbul'` in [vitest.config.ts:44](../vitest.config.ts#L44). Istanbul has slower instrumentation but is more stable in projects mode.
3. As a last resort, run main and renderer projects in two separate commands (`vitest run --project main --coverage` then `--project renderer --coverage`, merge reports) — works around projects-mode instrumentation bugs.

**Effort:** S (config change) — possibly L if root cause is a `vitest` regression that needs a workaround.

**Fix-phase prerequisite.** Until F1 is resolved, Surface A (per-file gaps) cannot be measured. The fix phase should land F1 first, then re-run coverage and add per-file findings as a follow-up if any use-case file is below 90 %.

---

### F2 — `CommentsTab.tsx` has no test file — HIGH

**Surface:** [src/renderer/components/features/videos/CommentsTab.tsx](../src/renderer/components/features/videos/CommentsTab.tsx) (300 LoC, newly shipped).

**Gap.** No `tests/renderer/components/features/videos/CommentsTab.test.tsx` — the directory does not exist. Glob-confirmed.

**Why it matters.** `CommentsTab` is a 5-state finite-state-machine over the `useFetchVideoComments` mutation. A regression in any branch (e.g., a stale `data` reference rendering before `isPending` flips) silently produces broken UI. The states map cleanly to test cases:

| State | Trigger | Visible behaviour |
|---|---|---|
| Idle (no `knownCount`) | `!isPending && !data && !isError` | "Click below to fetch comments" copy, no count phrase. |
| Idle (with `knownCount`) | as above + prop set | "This video has X comments" copy. |
| Loading | `isPending` | spinner + "Fetching comments…" |
| Error | `isError` | error message + Retry button calling `mutate`. |
| Loaded (with replies) | `data.totalFetched > 0`, `replies > 0` | reply count rendered, Collapsible toggles. |
| Loaded (truncated) | `data.wasTruncated === true` | "First 500 only" badge. |
| Loaded (empty) | `threads.length === 0` | "No comments on this video" empty state. |

**Suggested test:** `tests/renderer/components/features/videos/CommentsTab.test.tsx` with one `it()` per row above. Mock `useFetchVideoComments` per the existing renderer-test pattern (`vi.mock('@/hooks/use-videos', ...)` returning a controllable mock).

**Effort:** M (~150 LoC, one new test file, mock surface already used elsewhere).

---

### F3 — Renderer mutation hooks have zero invalidation tests — MEDIUM

**Surfaces.** 10 mutations across 6 hook files. None of them has a test asserting that `onSuccess` invalidates the right `queryKey`:

| Hook file | Mutation | Invalidates |
|---|---|---|
| [use-creators.ts:20](../src/renderer/hooks/use-creators.ts#L20) | `useDeleteCreator` | `creators.all` |
| [use-creators.ts:28](../src/renderer/hooks/use-creators.ts#L28) | `useRestoreCreator` | `creators.all` |
| [use-videos.ts:20](../src/renderer/hooks/use-videos.ts#L20) | `useDeleteVideo` | `videos.all` |
| [use-videos.ts:28](../src/renderer/hooks/use-videos.ts#L28) | `useRestoreVideo` | `videos.all` |
| [use-videos.ts:36](../src/renderer/hooks/use-videos.ts#L36) | `useFetchVideoDetail` | `videos.detail(id)` + `videos.transcript(id)` |
| [use-videos.ts:47](../src/renderer/hooks/use-videos.ts#L47) | `useEnrichAllVideos` | `videos.all` |
| [use-cuts.ts:28](../src/renderer/hooks/use-cuts.ts#L28) | `useDeleteCut` | `cuts.all` |
| [use-cuts.ts:36](../src/renderer/hooks/use-cuts.ts#L36) | `useRestoreCut` | `cuts.all` |
| [use-migrate-root.ts:27](../src/renderer/hooks/use-migrate-root.ts#L27) | `useMigrateRoot` | `settings.all` + `creators.all` + `videos.all` + `cuts.all` |
| [use-settings.ts:18](../src/renderer/hooks/use-settings.ts#L18) | `useSetSetting` | `settings.all` |

**Why it matters.** A typo in any `queryKey` argument leaves the UI showing stale data after a successful mutation — the most common class of TanStack Query bug. None is currently caught by either the type system (keys are `readonly unknown[]`) or runtime checks. The fix is mechanical: spy on `queryClient.invalidateQueries`, fire the mutation, assert call args.

**Skipped intentionally** (no invalidation, no finding):

- `useFetchVideoComments` — comments held only in mutation state, no cache write.
- `useFetchVideoInfo`, `useDownloadVideo`, `useCancelDownload` — state pushed via `onDownloadProgress` / `db-updated` listener.
- `useReconcile` — relies on `db-updated` notification + [use-db-listener.ts](../src/renderer/hooks/use-db-listener.ts).
- `useCheckForUpdates`, `useInstallUpdate` — driven by push subscription in `useUpdaterStatus`.

**Suggested tests.** One `tests/renderer/hooks/use-<name>.test.ts` per hook file (5 new files: `use-creators`, `use-videos`, `use-cuts`, `use-migrate-root`, `use-settings`). Each renders with a `QueryClientProvider`, spies on `invalidateQueries`, fires the mutation, and asserts the invalidation arg. Pattern can be cribbed from the existing [tests/renderer/hooks/use-app-store.test.ts](../tests/renderer/hooks/use-app-store.test.ts) and zustand convention — adapt to TanStack Query.

**Effort:** M overall (~300 LoC across 5 new files; per-hook is S).

**Note.** `useMigrateRoot` is the highest-blast-radius case (4-key invalidation) and the cheapest to break in a typo — prioritise it within this finding.

---

### F4 — Coverage exclusion-list drift between vitest.config.ts and AGENTS.md L509 — MEDIUM

**Surfaces.** [vitest.config.ts:48-74](../vitest.config.ts#L48-L74) vs [AGENTS.md L509](../AGENTS.md#L509).

**Drift A — use-case interfaces under-excluded.** AGENTS.md states the rule as `src/main/use-cases/I*.ts` (a glob), but vitest.config.ts lists 5 specific files:

```ts
'src/main/use-cases/IReconcileDirectory.ts',
'src/main/use-cases/IFetchVideoInfo.ts',
'src/main/use-cases/IDownloadVideo.ts',
'src/main/use-cases/IProbeMediaFile.ts',
'src/main/use-cases/IRecoverOperations.ts',
```

The directory currently contains **11 `I*.ts` files**, so 6 are missed:

- [IEnrichMediaMetadata.ts](../src/main/use-cases/IEnrichMediaMetadata.ts)
- [IFetchChannelInfo.ts](../src/main/use-cases/IFetchChannelInfo.ts)
- [IMigrateRootFolder.ts](../src/main/use-cases/IMigrateRootFolder.ts)
- [IFetchVideoDetail.ts](../src/main/use-cases/IFetchVideoDetail.ts)
- [IEnrichAllVideos.ts](../src/main/use-cases/IEnrichAllVideos.ts)
- [IFetchVideoComments.ts](../src/main/use-cases/IFetchVideoComments.ts)

These files are pure interfaces that compile to no JS, so the practical impact on percentages is small — but the explicit list will keep drifting every time a new use-case ships, defeating the AGENTS.md rule.

**Drift B — `src/shared/**` excluded but not documented.** vitest.config.ts excludes the entire shared tree on line 72. AGENTS.md L509 does not mention it. Audit of [src/shared/](../src/shared/) confirms the contents are predominantly type-only (DTOs, ipc-channels constants, type re-exports), so the exclusion is materially correct — but the doc should reflect the implementation or vice versa.

**Suggested fix.**

1. Replace the 5-line specific list with the glob `'src/main/use-cases/I*.ts'`.
2. Either (a) add a one-line note to AGENTS.md L509 mentioning `src/shared/**` is excluded as type-only, or (b) drop the `src/shared/**` exclusion and rely on the include list (which already lists `src/shared/**/*.ts`) — preferred only if a future shared module starts carrying logic.

**Effort:** XS (one-line config change + one-line doc note).

---

### F5 — `ProcessFileNotifications` suspend-during-in-flight-flush race uncovered — LOW

**Surface:** [tests/main/use-cases/ProcessFileNotifications.test.ts](../tests/main/use-cases/ProcessFileNotifications.test.ts) (377 LoC, 21 tests).

**What's covered (CLEAN).** Suspend / resume lifecycle is exercised across 7 tests: drops events when suspended, cancels pending debounce on suspend, drains stale events on resume, accepts events after resume, isSuspended state, double-suspend safe, resume-without-suspend safe. Plus 2 double-buffer tests verifying that `handleEvent` doesn't re-schedule debounce while a flush is in progress.

**What's uncovered.** Calling `suspend()` *while* a `flush()` callback is mid-execution. Concretely:

1. Flush callback starts (drained events being processed by `executeForCreator` / `execute`).
2. User triggers `suspend()` (e.g., by pressing the Migrate Root button mid-reconcile).
3. Resume happens later.

Does the in-flight flush complete before the suspend takes effect? Does it abort? Does the state machine remain coherent? The codeOverview prompt specifically called this out (Step 5 §5: *"`ProcessFileNotifications` suspend/resume during in-flight events"*).

**Why LOW.** The flush callback is short (drains queue, runs reconcile, notifies) and the suspend mechanism is monotonic — once suspended, new `handleEvent` calls drop. The likely behaviour is "flush completes, then suspend takes effect on the next tick", which is fine. But the contract is currently implicit.

**Suggested test.** One `it()` in the existing "double-buffer behaviour" describe block:

```ts
it('lets in-flight flush complete when suspend fires mid-flush', async () => {
  // start a flush, call suspend before it resolves, await, assert state.
})
```

**Effort:** S (one new test, ~20 LoC).

---

### F6 — `FetchVideoComments` error-propagation branch unverified — LOW

**Surface:** [src/main/use-cases/FetchVideoComments.ts:33](../src/main/use-cases/FetchVideoComments.ts#L33) — the `await this.downloader.fetchComments(...)` call.

**What's covered.** [tests/main/use-cases/FetchVideoComments.test.ts](../tests/main/use-cases/FetchVideoComments.test.ts) covers 6 cases: video-not-found, no-URL, happy path, truncation flag, default `maxComments=500`, no-persist invariant.

**What's uncovered.** No test rejects the downloader (`downloader.fetchComments` throwing or rejecting) to verify that the error propagates cleanly through `execute()`. The 90s timeout the codeOverview prompt called out lives in [YtDlpDownloader.ts](../src/main/framework-drivers/yt-dlp/YtDlpDownloader.ts) (excluded from coverage per AGENTS.md L509), so the timeout itself is not directly testable in coverage terms — but the *use-case-side propagation* of any downloader error is.

**Why LOW.** The use-case is a 1-statement passthrough — there's no error handling to verify, just `await`. Promise rejection bubbles by language semantics. Worth a one-liner regression test, not a HIGH.

**Suggested test.**

```ts
it('propagates downloader errors (timeout, network) to the caller', async () => {
  vi.mocked(mocks.videoRepo.findById).mockReturnValue(makeVideo())
  vi.mocked(mocks.downloader.fetchComments).mockRejectedValue(
    new Error('yt-dlp comment fetch timed out after 90s')
  )
  await expect(useCase.execute('video-1')).rejects.toThrow('timed out')
})
```

**Effort:** XS.

---

## Verified clean (audit log)

Static analysis confirmed the following surfaces had a corresponding test file or in-test scenario; future audits start from this baseline.

- ✅ **All 12 use-cases under [src/main/use-cases/](../src/main/use-cases/) have a test file.** Per-file *coverage percentages* are blocked behind F1.
- ✅ **All 9 repositories** (3 Sqlite for creator/video/cut + 3 Audited decorators + Sqlite{Operation,Settings,AuditLog}) have a test file.
- ✅ **All 9 IPC controllers** under [interface-adapters/controllers/](../src/main/interface-adapters/controllers/) have a test file (controllers excluded from coverage anyway, but tests serve as functional contracts).
- ✅ **All 5 logic-bearing domain types** (`pagination`, `slugify`, `collapse-events`, `path-classification`, `parse-vtt`) have a test file.
- ✅ **Both queue implementations** (`PQueueDownloadQueue`, `PQueueNotificationQueue`) have a test file.
- ✅ **Database init / transaction-scope** (`database.test.ts`, `SqliteTransactionScope.test.ts`) — clean.
- ✅ **Composition-root smoke test** ([tests/main/composition-root.test.ts](../tests/main/composition-root.test.ts)) — clean.
- ✅ **B-8 MigrateRootFolder rollback** — covered by 2 tests: partial-move-failure rollback + DB-failure-after-move ([MigrateRootFolder.test.ts:262, :289](../tests/main/use-cases/MigrateRootFolder.test.ts#L262)).
- ✅ **B-9 ProcessFileNotifications suspend/resume** — 7 lifecycle tests + 2 double-buffer tests cover the high-blast-radius cases. (One narrow race uncovered — see F5.)
- ✅ **B-10 RecoverOperations matrix** — comprehensive: all 3 `OperationType`s × `pending`/`in_progress` are exercised, plus malformed-payload, parse-error, stranded-folders, and mixed-batch edge cases. 12 tests in [RecoverOperations.test.ts](../tests/main/use-cases/RecoverOperations.test.ts).
- ✅ **D-21 Excluded-but-testable surface review** — every excluded path in [vitest.config.ts:48-74](../vitest.config.ts#L48-L74) has a defensible reason (Electron-bound, auto-generated, type-only, or under integration-test surface). No exclusion is hiding logic that *should* be measured. (Drift on the *list itself* is F4.)

---

## Coverage snapshot

**Blocked by F1.** Re-run after fix:

```bash
npm run test:coverage
cat coverage/coverage-summary.json | jq '.total'
```

Once unblocked, fill the table below for `src/main/use-cases/` (12 rows) and pick up any file below the 90 % line / 80 % branch target as new findings.

| File | Lines | Branches | Functions |
|---|---|---|---|
| _pending F1_ | — | — | — |

---

## Fix sequencing

Proposed order:

| # | Finding | Effort | Reason |
|---|---|---|---|
| 1 | **F1** — Restore coverage tooling | S–L | Unblocks Surface A and CI. Must land first. |
| 2 | **F2** — `CommentsTab.test.tsx` | M | Highest user-visible blast radius among missing tests; newly shipped feature. |
| 3 | **F3** — Renderer mutation-hook tests | M | 5 new test files, one per hook; prioritise `useMigrateRoot` (4-key) within. |
| 4 | **F4** — Exclusion-list drift | XS | One-line config change + one-line AGENTS.md note. |
| 5 | **F5** — `ProcessFileNotifications` mid-flush suspend | S | Single new test in existing describe block. |
| 6 | **F6** — `FetchVideoComments` error-propagation | XS | Single new `it()` in existing test file. |
| 7 | **Surface A backfill** (after F1) | depends | Re-run coverage; add per-file findings only if any use-case is below 90 % / 80 %. |
| 8 | **Per-project 90 % threshold** for `src/main/use-cases/` (closes [AGENTS.md L508](../AGENTS.md#L508)) | XS | Add `coverage.thresholds.perFile` block scoped to use-cases. Lands after step 7 confirms all use-cases are above 90 %. |

**Verification gate after fix phase:** `npm run typecheck && npm run lint && npm run test:coverage` (all targets green, new use-case threshold passes).
