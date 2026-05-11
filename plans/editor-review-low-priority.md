# Editor MVP — low-priority review findings

**Companion document to** [editor-review-findings.md](editor-review-findings.md).

This file tracks findings that are either:

- Backed only by agent reports (not personally verified by me), AND
- Not load-bearing for correctness or daily UX.

I would not block a merge or sprint on any of these. They're documented so they don't get lost — pick them up opportunistically when touching the relevant file, or batch them into a "polish pass" PR much later.

**Confidence on every entry below:** 50–70% unless noted otherwise. The agent reports were specific but I did not re-read the source for these.

---

## Other notable findings

### LP-1. Audit log noise: every cancelled/failed render writes `cut.created` + `cut.deleted` pairs

**Files:** [src/main/use-cases/RenderCutFromVideo.ts:158,353](../src/main/use-cases/RenderCutFromVideo.ts#L158-L353), `src/main/interface-adapters/repositories/AuditedCutRepository.ts`
**Confidence:** 70%

The Cut-row-first watcher-race guard means every render writes `cut.created`. On cancel/failure, `cleanupOnFailure` calls `cutRepo.delete(cutId)` which fires `cut.deleted`. Audit log fills with phantom-create/phantom-delete pairs the user can't correlate to any visible action. Crash-recovery does the same.

**Fix sketch:** add a `softDeleteSilent` path or a dedicated `audit action: 'recovery_cleanup'` so editor-driven cleanups are filterable.

---

### LP-2. Use-case re-validates the IPC payload and leaks Zod issue paths

**File:** [src/main/use-cases/RenderCutFromVideo.ts:71-74](../src/main/use-cases/RenderCutFromVideo.ts#L71-L74)
**Confidence:** 80% (verified the re-validation; not the leak severity)

`createTypedHandler` already runs the Zod parse. The use-case re-runs it and includes `parsed.error.message` in the thrown error — exactly what `create-typed-handler.ts` deliberately doesn't do for security.

**Fix sketch:** drop the in-use-case re-parse, or replace the message with a stable string.

---

### LP-3. `PQueueRenderQueue.enqueue` `as Promise<T>` cast lies about the return type

**File:** `src/main/interface-adapters/queue/PQueueRenderQueue.ts:21`
**Confidence:** 75%

Agent claim: `pQueue.add()` in v8 returns `Promise<T | void>`; the `as Promise<T>` cast hides the `void` case. No consumer awaits the resolved value today, so it's benign — but the contract drifts from the interface.

**Fix sketch:** change the port to `Promise<T | undefined>`, or assert non-skip in the adapter.

---

### LP-4. Timeline a11y: `role="slider"` + `tabIndex={0}` but no `onKeyDown`

**File:** [src/renderer/components/features/editor/Timeline.tsx](../src/renderer/components/features/editor/Timeline.tsx)
**Confidence:** 70%

Keyboard-only users can focus the timeline but cannot scrub. ATs see a slider that doesn't respond to arrow keys.

**Fix sketch:** add `onKeyDown` for ArrowLeft/Right (±1s), Shift+Arrow (±5s), Home/End (0/duration); set `aria-valuetext={formatSeconds(cursorSec)}`.

---

### LP-5. Render progress chip dismiss "X" is a `<span>` inside a `<button>`

**File:** [src/renderer/components/features/editor/RenderProgressChip.tsx:75-89](../src/renderer/components/features/editor/RenderProgressChip.tsx#L75-L89)
**Confidence:** 65%

Agent claim: `<Button asChild>` resolves to a `<span>` (Radix Slot) inside the outer chip button → not focusable, not Enter-activatable. Mouse-only dismissal.

**Fix sketch:** restructure — outer `<div>` (visual chip) with two real `<button>` children (focus + dismiss) inside.

---

### LP-6. `WindowManagerConfig.width: isEditor ? 1280 : 1280` (dead ternary)

**File:** [src/main/framework-drivers/electron/WindowManager.ts:73-74](../src/main/framework-drivers/electron/WindowManager.ts#L73-L74)
**Confidence:** 60%

Trivial — pure dead code.

**Fix sketch:** drop the ternary, set `width: 1280`.

---

### LP-7. `RenderResult` type exported but never imported

**File:** [src/shared/types/render-job.ts:31-37](../src/shared/types/render-job.ts#L31-L37), [src/shared/types/index.ts:74](../src/shared/types/index.ts#L74)
**Confidence:** 70%

`IRenderBackend.render` returns `RenderBackendResult` (durationMs only); `RenderCutFromVideo` discards it. `RenderResult` (with `outputPath`) appears unused.

**Fix sketch:** delete or wire into `editor-start-render` response.

---

### LP-8. `IEditorSessionStore.list()` is documented as serving the chip + recovery, but neither uses it

**File:** [src/main/domain/ports/IEditorSessionStore.ts:35-36](../src/main/domain/ports/IEditorSessionStore.ts#L35-L36)
**Confidence:** 70%

Only the shutdown loop uses it. Chip uses `editor-get-session` keyed by jobId; recovery uses the operations table.

**Fix sketch:** expose `list()` via IPC for the chip, or trim the docstring.

---

### LP-9. `assertSingleClipInvariant` exported but never called at runtime

**File:** [src/renderer/lib/recipe-from-timeline.ts:41-49](../src/renderer/lib/recipe-from-timeline.ts#L41-L49)
**Confidence:** 80% (verified the absence via grep; agent claim about "documented as parse boundary")

Docstring claims "exposed for the store's parse boundary"; the store doesn't call it. Only `recipeFromTimeline` does (line 96).

**Fix sketch:** call from `initSourceVideo` / `writeRegion`, or remove the misleading wording.

---

### LP-10. Hashchange reload nukes mid-render UI state

**File:** [src/renderer/src/EditorApp.tsx:74-82](../src/renderer/src/EditorApp.tsx#L74-L82)
**Confidence:** 75% (verified the unconditional `window.location.reload()`)

The hashchange listener does an unconditional reload. Loses every piece of mark/cursor state if a future deep link inside the editor (e.g. `#/editor/<id>?cut=<cutId>`) updates only the query string. Combined with HP-7, the in-flight job mirror is also lost.

**Fix sketch:** parse the new hash, compare `sourceVideoId`; reload only if it changed, otherwise let renderer state decide.

---

### LP-11. `<video>` mirror effect runs on every store mutation

**File:** [src/renderer/components/features/editor/EditorView.tsx:66-74](../src/renderer/components/features/editor/EditorView.tsx#L66-L74)
**Confidence:** 65%

Agent claim: `useEffect(() => {...}, [timeline])` re-runs whenever `timeline` is replaced — which is every mutator. Cheap but redundant.

**Fix sketch:** depend on `timeline?.cursorSec` only.

---

### LP-12. Tags array accepts empty strings

**File:** [src/shared/types/render-job.ts:64](../src/shared/types/render-job.ts#L64)
**Confidence:** 65%

`tags: z.array(z.string().max(64)).max(64)` should be `z.array(z.string().min(1).max(64))`. Empty tags get persisted into `cuts.tags`.

**Fix sketch:** add `.min(1)` and a renderer-side dedupe/trim before submit.

---

### LP-13. `IRenderQueue` and `IDownloadQueue` are byte-identical

**Files:** `src/main/domain/ports/IRenderQueue.ts`, `src/main/domain/ports/IDownloadQueue.ts`
**Confidence:** 65%

Two interfaces, two implementations, same shape. A future `PQueueEnrichmentQueue` would be the third.

**Fix sketch:** define `ITaskQueue`; composition root constructs three named instances. Runtime isolation preserved; type stops duplicating.

---

### LP-14. `renameDirectory` used to rename a file

**File:** [src/main/use-cases/RenderCutFromVideo.ts:287](../src/main/use-cases/RenderCutFromVideo.ts#L287)
**Confidence:** 80% (verified the call site; agent claim about port semantics)

`renameDirectory(stagingPath, finalPath)` is called with two file paths. Works because `renameSync` handles both, but the port name promises directory semantics.

**Fix sketch:** rename port method to `rename(srcPath, destPath)`, or add a separate `renameFile` method.

---

### LP-15. ffmpeg `-protocol_whitelist` not pinned

**File:** [src/main/framework-drivers/ffmpeg/argv-builder.ts](../src/main/framework-drivers/ffmpeg/argv-builder.ts)
**Confidence:** 60%

Defence-in-depth: prepend `-protocol_whitelist file,crypto,data` so even if a future bug surfaces a recipe-controlled path, ffmpeg refuses anything that isn't a local file. `sourcePath` traces to `videoRepo.findById(...).filePath` today — not user-controlled via the editor's IPC — so this is preventive only.

---

### LP-16. Editor window inherits `theme` via `next-themes` storage key but not via IPC

**File:** [src/renderer/src/EditorApp.tsx:43](../src/renderer/src/EditorApp.tsx#L43)
**Confidence:** 70%

Theme works because both windows read `localStorage[klip-theme]`. Language doesn't, because i18next reads from settings DB once at boot. Inconsistency.

**Fix sketch:** see MI-7 in the high-priority doc — mount `<PreferencesBootstrap />` in the editor window.

---

### LP-17. ElectronNotifier broadcasts `render-progress` to every BrowserWindow including DevTools

**File:** `src/main/framework-drivers/electron/ElectronNotifier.ts`
**Confidence:** 60%

Not load-bearing. With 0.5% throttle and a long render, it's a few hundred messages × every window. Minor IPC-bus noise. Also: no `webContents.isDestroyed()` guard before `send` — could throw on a window mid-close.

**Fix sketch:** filter by `!win.isDestroyed() && !win.webContents.isDestroyed()`.

---

### LP-18. `parseProgressLine` uses `parseInt` instead of `Number`

**File:** [src/main/framework-drivers/ffmpeg/FfmpegRenderBackend.ts:153](../src/main/framework-drivers/ffmpeg/FfmpegRenderBackend.ts#L153)
**Confidence:** 70%

`parseInt('1.5e7', 10)` returns 1, silently truncating exponential notation. Today ffmpeg doesn't emit such lines, but future versions may.

**Fix sketch:** use `Number(value)` with the existing `Number.isFinite` guard.

---

### LP-19. `proc.stdout.on('data')` accumulates `stdoutBuffer` with no cap

**File:** [src/main/framework-drivers/ffmpeg/FfmpegRenderBackend.ts:72-89](../src/main/framework-drivers/ffmpeg/FfmpegRenderBackend.ts#L72-L89)
**Confidence:** 65%

Defensive: if ffmpeg emits a single line >> 64KB without a newline, the buffer grows unbounded.

**Fix sketch:** `if (stdoutBuffer.length > 64*1024) stdoutBuffer = ''`.

---

### LP-20. `tagSuggestions` shadows the `t` translator inside SaveCutDialog

**File:** `src/renderer/components/features/editor/SaveCutDialog.tsx:43`
**Confidence:** 65%

`distinctTags?.map((t) => t.tag)` — the `t` parameter shadows `useTranslation`'s `t`. Not a bug, just naming.

**Fix sketch:** `({ tag }) => tag`.

---

### LP-21. Editor's `formatSeconds` duplicates `formatDuration` from `lib/format.ts`

**File:** [src/renderer/components/features/editor/EditorView.tsx:207-220](../src/renderer/components/features/editor/EditorView.tsx#L207-L220)
**Confidence:** 65%

Two divergent time formatters (the editor adds milliseconds).

**Fix sketch:** consolidate as `formatTimecode(s, { showMs?: true })` in `lib/format.ts`.

---

### LP-22. Edit button: video-not-probed gate uses `!video.duration` instead of `!Number.isFinite(video.duration)`

**File:** [src/renderer/src/routes/videos.$videoId.tsx:116-119](../src/renderer/src/routes/videos.$videoId.tsx#L116-L119)
**Confidence:** 65%

`!NaN === true` so NaN is caught by accident; the check is brittle.

**Fix sketch:** `if (!Number.isFinite(video.duration) || video.duration <= 0)`.

---

### LP-23. ffmpeg input filename starting with `-` would mis-parse

**File:** [src/main/framework-drivers/ffmpeg/argv-builder.ts:40,69](../src/main/framework-drivers/ffmpeg/argv-builder.ts#L40-L69)
**Confidence:** 60%

`-i sourcePath` mis-parses if `sourcePath` starts with `-`. N/A today (paths are absolute), but `path.resolve()` at the spawn boundary would close the door.

---

### LP-24. Reserved-op schemas have no `.finite()` / upper bounds

**File:** [src/shared/types/edit-recipe.ts:44-61](../src/shared/types/edit-recipe.ts#L44-L61)
**Confidence:** 100%

Same gap as HP-3 but for the reserved op variants (`crop.w/h`, `speed.factor`, `fade.durationMs`). Not reachable today (`isMvpSupportedRecipe` rejects upfront), live in v2.

**Fix sketch:** add `.finite()` and sensible upper bounds before v2 turns them on.

---

### LP-25. No `.strict()` on `editRecipeSchema` / `editOpSchema`

**File:** [src/shared/types/edit-recipe.ts:74-82](../src/shared/types/edit-recipe.ts#L74-L82)
**Confidence:** 100%

Zod default is to strip unknown keys (safe today). A v2 path that round-trips through `JSON.parse` without re-validation could surface stripped fields.

**Fix sketch:** add `.strict()`.

---

### LP-26. Editor shortcut `mod+enter` overlaps with `forms.submit`

**File:** [src/renderer/components/features/help/shortcut-registry.ts:45,109-113](../src/renderer/components/features/help/shortcut-registry.ts#L45-L113)
**Confidence:** 70%

Help overlay renders `mod+enter` twice (Forms group + Editor group). Visual duplication.

---

### LP-27. `<video>` element has no `aria-label`

**File:** [src/renderer/components/features/editor/EditorView.tsx:127-134](../src/renderer/components/features/editor/EditorView.tsx#L127-L134)
**Confidence:** 65%

Browser-native controls have implicit labels but no caption/desc track for the surrounding context.

---

### LP-28. `RenderProgress.errorMessage` is rendered with English fallback through i18n

**File:** [src/renderer/components/features/editor/RenderProgress.tsx:100](../src/renderer/components/features/editor/RenderProgress.tsx#L100)
**Confidence:** 60%

`errorMessage ?? t('progress.sub.errorFallback')` — `errorMessage` from main is whatever the use-case threw, untranslated.

**Fix sketch:** map a structured error code (instead of free-form message) through the `render-progress` event; the renderer translates.

---

## Test coverage gaps

### TC-1. `RenderCutFromVideo` orchestration has zero tests

The most stateful, failure-prone file in the change. The following branches are untested:

- Cancel during the synchronous prelude (HP-6).
- Source missing → no Cut row, no operation row.
- Backend reports success but file missing → operation marked failed, Cut row deleted.
- Two parallel `execute()` calls with the same `cutId` (idGenerator collision; would surface HP-6 immediately).
- Watcher race simulation (Cut row first invariant).

### TC-2. `RecoverOperations.recoverRenderCutOp` has zero tests

The "always rolls back" assertion (HP-1) would have been caught by a single test. Add at minimum:

- Rendered file exists at `finalPath`, op is `in_progress` → should mark `completed`, NOT delete.
- Rendered file missing, op is `in_progress` → roll back, delete row.
- Payload malformed (parse error, schema error) → roll back with error message.
- Cut row already deleted (race with concurrent recovery) → no crash.

### TC-3. No FfmpegRenderBackend subprocess-lifecycle tests

Current tests cover `parseProgressLine` only. Untested:

- SIGTERM behavior on POSIX vs Windows (HP-4).
- stderr-tail truncation in error messages.
- Abort firing during stdout buffering.
- Abort firing twice (idempotency).

### TC-4. No watcher-race test

The "Cut row first → atomic rename" guard is invariant-by-comment. A simulator-style test using a fake watcher event stream + the real ReconcileDirectory would lock it in.

### TC-5. No crash-mid-render → recovery → reconcile end-to-end test

Would catch HP-1 + HP-2 + MI-1 simultaneously. Even an in-memory adapter test:

1. Call `execute()`, halt the queue task mid-render.
2. Construct a fresh container with the same DB.
3. Run `recoverOperations.execute()`.
4. Assert: no Cut row, no staging file, op rolled-back (or `completed`, depending on simulated crash point).
5. Run reconcile.
6. Assert: no phantom cut.

### TC-6. No test that the MVP gate (`isMvpSupportedRecipe` + `canRender` + `buildFfmpegArgv`) all reject the same set of inputs

Three layers re-encode the same predicate. A future v2 author lifting `isMvpSupportedRecipe` to allow `concat` will need to update all three; a property-based test that asserts "if any layer accepts, all layers accept" would prevent silent mismatches.

### TC-7. No `out > in` validation test

HP-3 — Zod accepts `{ in: 5, out: 5 }` and `{ in: 5, out: 4 }`. A schema-level test would catch this.

### TC-8. No `setInPoint` / `setOutPoint` boundary tests for the silent-clobber bugs (HP-5)

Specifically:

- `setInPoint(durationSec)` (boundary).
- `setOutPoint(0)` with no in-point.
- `setInPoint(7)` with existing `out=5` (the silent-clobber).
- `setOutPoint(3)` with existing `in=5` (symmetric).

### TC-9. No `recipe-from-timeline` round-trip property test

Currently a single example with hard-coded numbers. Use `fast-check` or just iterate over `[0, 0.1, 1, 10, 30]` × duration.

### TC-10. No `Timeline` component test

Click-to-seek math, region clamping when `out > duration`, and the missing keyboard handler (LP-4) are entirely uncovered.

### TC-11. No `SaveCutDialog` test

Double-submit guard (MI-12), form-reset on reopen, error-display path, tag normalisation gap (LP-12) all uncovered.

### TC-12. No `RenderProgressChip` test

Terminal-fadeout 4s timer, race when a new `queued` arrives mid-fadeout, dismiss-button stopPropagation, "X is a span not a button" a11y issue (LP-5) all untested.

### TC-13. No `EditorApp` bootstrap test

Source-not-found fallthrough, IPC rejection paths, hashchange-reload (LP-10) have no coverage.

### TC-14. No "open editor while one is in flight" integration test

HP-7 (rehydration) hinges on this scenario; no test exercises the close→reopen rehydration contract.

---

## Disposition

These items are deliberately **low priority**. The right time to clear them:

- LP items: opportunistically when touching the relevant file. Don't open standalone PRs.
- TC items: each new bug fix from the high-priority doc should add the matching test, not retroactively backfill the whole list.

If a polish/cleanup sprint materializes later, batch the LP items thematically (a11y batch, schema-tightening batch, port-consolidation batch).
