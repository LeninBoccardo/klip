# Editor MVP — code review findings

**Scope:** the 12 commits `8d98e0b → d91b289` that shipped the in-app video editor (phases 1–11).
**Method:** four parallel deep-review agents (backend, renderer, architecture, security) cross-checked, then load-bearing claims personally verified by reading the source.
**Confidence rubric:**
- 95–100% — verified in the source by hand
- 80–94% — multiple agents converged + claim is specific enough that misreading is unlikely
- 60–79% — single agent claim with specific evidence, not yet personally verified

This doc covers **High Priority** (verified issues, fix soon) and **Must Investigate More** (plausible issues that need a second look before action). Lower-priority findings are tracked separately in [editor-review-low-priority.md](editor-review-low-priority.md).

---

## High Priority

Items below are verified personally against the source. Confidence ≥ 85% on every entry.

### HP-1. Recovery rolls back successful renders that crashed before the "completed" write

**Files:** [src/main/use-cases/RenderCutFromVideo.ts:287-304](../src/main/use-cases/RenderCutFromVideo.ts#L287-L304), [src/main/use-cases/RecoverOperations.ts:258-296](../src/main/use-cases/RecoverOperations.ts#L258-L296)
**Confidence:** 85%

`performRender` does (line 287) rename → (302) sidecar write → (304) `operationRepo.updateStatus(jobId, 'completed')`. A crash between line 287 and line 304 leaves the file at `finalPath` but the operation row still at `in_progress`. Next launch, `recoverRenderCutOp` runs and unconditionally deletes the Cut row + tries to delete the staging file — destroying the user's successful render.

The docstring at `RecoverOperations.ts:258-260` explicitly defends "always rolls back" with the claim that "there is no 'render completed but the row update crashed' path." That claim is false: the gap exists between rename (287) and updateStatus (304).

**Practical impact:** crash window is sub-100ms, low likelihood in real use, but the failure mode is "user loses a successful cut" which is high blast-radius when it happens.

**Fix sketch:** in `recoverRenderCutOp`, if `fsReader.fileExists(finalPath)`, mark the op `completed` instead of rolling back; the file + Cut row are real.

---

### HP-2. Orphan `cutDir` left behind on every failed/cancelled render

**Files:** [src/main/use-cases/RenderCutFromVideo.ts:283,345-357](../src/main/use-cases/RenderCutFromVideo.ts#L283-L357), [src/main/use-cases/RecoverOperations.ts:262-296](../src/main/use-cases/RecoverOperations.ts#L262-L296)
**Confidence:** 95% on the orphan dir; 65% on the "phantom row on next reconcile" downstream effect (depends on ReconcileDirectory.ts:453 behavior — see Tier 2 entry MI-1).

`ensureDirectory(cutDir)` runs at line 283 (inside the try). If the rename or anything after it fails, `cleanupOnFailure` (lines 345-357) deletes the staging file + the Cut row — but never removes `cutDir`. Recovery sweep has the same gap. The empty `<creator>/cuts/<cutId>/` directory persists.

**Practical impact:** every cancelled/failed render leaks an empty directory under the user's library. Cosmetic at first; potentially generates phantom Cut rows on next reconcile sweep (see MI-1 for that half).

**Fix sketch:** add `removeDirectory(path, { ifEmpty: true })` to `IFileSystemWriter`, call it from `cleanupOnFailure` and `recoverRenderCutOp`.

---

### HP-3. Trim recipe schema accepts `out ≤ in`, `Infinity`, no upper bound

**File:** [src/shared/types/edit-recipe.ts:22-26](../src/shared/types/edit-recipe.ts#L22-L26)
**Confidence:** 100%

```ts
const trimOpSchema = z.object({
  type: z.literal('trim'),
  in: z.number().min(0),
  out: z.number().min(0)
})
```

No `.finite()` (so `Infinity` passes — `Infinity >= 0` is true). No `.refine(o => o.out > o.in)`. No upper bound.

A request with `{ in: 10, out: 5 }` reaches ffmpeg, which silently produces a 0-byte file with exit code 0; the render path accepts it, writes the sidecar, and the user gets a phantom 0-byte cut. Same gap on the reserved op variants (`crop.w/h`, `speed.factor`, `fade.durationMs`).

**Fix sketch:** add `.finite()` and a `.refine` checking `out > in`. Five-line change.

---

### HP-4. Windows cancel is actually SIGKILL, no escalation timeout

**File:** [src/main/framework-drivers/ffmpeg/FfmpegRenderBackend.ts:65-70,98-122](../src/main/framework-drivers/ffmpeg/FfmpegRenderBackend.ts#L65-L122)
**Confidence:** 98% (Windows behavior); 100% (no escalation)

```ts
proc.kill('SIGTERM')
```

Documented Node.js behavior: on Windows, the signal arg is ignored — `process.kill` calls `TerminateProcess` regardless of signal name. The comment at lines 65-67 ("ffmpeg honours it cleanly and writes a final progress=end line") is wrong on Windows.

There is also no SIGTERM → SIGKILL escalation timer. On POSIX, if ffmpeg ignores SIGTERM (stuck in I/O on a slow disk), the cancel hangs indefinitely.

**Practical impact:** smaller than I initially framed. `cleanupOnFailure` deletes the staging file regardless, so the "leak partial mp4 with no moov atom" worry is mostly defused. The visible UX is "cancel button works, progress=end line never arrives" on Windows, and "rare hang" on POSIX.

**Fix sketch:** on Windows, write `q\n` to ffmpeg's stdin (requires changing `stdio[0]` from `'ignore'` to `'pipe'`) for graceful shutdown. Add a 5s SIGTERM→SIGKILL timer for POSIX.

---

### HP-5. `setInPoint` / `setOutPoint` silently destroy the user's other endpoint

**File:** [src/renderer/hooks/use-editor-store.ts:106-132](../src/renderer/hooks/use-editor-store.ts#L106-L132)
**Confidence:** 100%

```ts
setInPoint(sec) {
  // ...
  const existingOut = clip.region?.outSec ?? null
  const newOut = existingOut !== null && existingOut > clamped ? existingOut : null
  return { timeline: writeRegion(tl, { inSec: clamped, outSec: newOut ?? clamped + 0.001 }) }
}
```

Scenario: user marks out=5, then later marks in=7. `existingOut > clamped` is `5 > 7` = false → `newOut = null` → the existing out=5 is **silently discarded** and replaced with `7.001`. No undo, no toast, no warning.

Symmetric bug in `setOutPoint`: setting out=3 with existing in=5 throws away in=5 (line 128 sets `newIn = Math.max(0, 3 - 0.001) = 2.999`).

Bonus boundary bug: marking in at duration=30 (clamped=30) produces `outSec = 30.001`, which exceeds `clip.durationSec`. `isTimelineSaveable` then silently returns false and the Save button greys out — user has no idea why.

**Practical impact:** daily user-facing bug; the editor's most basic action quietly destroys input.

**Fix sketch:** if the new endpoint inverts the existing one, refuse the mark and surface a toast ("New in-point is past the out-point — clear the region first") OR explicitly swap them. Don't synthesize a fake other endpoint.

---

### HP-6. Synchronous prelude in `execute()` leaks DB state on early throw

**File:** [src/main/use-cases/RenderCutFromVideo.ts:128-209](../src/main/use-cases/RenderCutFromVideo.ts#L128-L209)
**Confidence:** 70%

Every step from `operationRepo.create` (128) → `cutRepo.upsertWithPrevious` (158) → `sessions.open` (164) → `emit` (178) → `enqueue` (186) runs synchronously on the IPC thread. If any of those throws after line 128, the operation row + (possibly) the Cut row + (possibly) the session entry are leaked; only the next-launch recovery sweep cleans up.

`sessions.open` documented to throw on duplicate jobId (per `InMemoryEditorSessionStore`). `idGenerator.generate()` makes collisions vanishingly unlikely, so the practical leak is rare — but the throw paths exist.

**Practical impact:** very low (rare to actually hit). Listed here because the fix is small and the orchestrator file already has too many invariants to remember.

**Fix sketch:** wrap the prelude (lines 128–207) in try/catch that runs the same `cleanupOnFailure` + rolled-back op update before re-throwing.

---

### HP-7. Editor never rehydrates from `editorGetSession` after window-close mid-render

**Files:** [src/renderer/src/EditorApp.tsx:58-115](../src/renderer/src/EditorApp.tsx#L58-L115), [src/renderer/hooks/use-editor-store.ts:18-19](../src/renderer/hooks/use-editor-store.ts#L18-L19)
**Confidence:** 100%

The store's docstring (line 18-19) claims "a reopened editor rehydrates by calling `editorGetSession(jobId)`." Grep confirmed: no renderer code ever calls `editorGetSession`. The IPC channel + preload + controller all exist but no caller.

After window-close-during-render → reopen, the store has `activeJobId === null`. The render-progress listener filters events by jobId (line 154: `if (get().activeJobId !== jobId) return`), so progress events are dropped. User sees a clean editor with no indication anything is happening.

The whole multi-window architectural promise (plan §9.4: "closing the editor mid-render does NOT cancel the render. The main window shows a sidebar progress chip; on completion the cut appears") is broken on the editor-window side.

**Practical impact:** the highest-value MVP feature ("user can keep using the app while a render runs") visibly fails when the user reopens the editor.

**Fix sketch:** in `EditorBootstrap`, after `useSourceVideoBootstrap`, fetch any active session by source via a new IPC channel (or extend `editorGetSession` to accept a `sourceVideoId`) and prime `beginTracking` + `updateJob` from the snapshot.

---

### HP-8. Graph-shaped timeline state is theatre — every consumer hard-codes `[0][0]`

**Files:** [src/renderer/components/features/editor/Timeline.tsx:26](../src/renderer/components/features/editor/Timeline.tsx#L26), [src/renderer/components/features/editor/EditorView.tsx:146-179](../src/renderer/components/features/editor/EditorView.tsx#L146-L179), [src/renderer/hooks/use-editor-store.ts:110,124,184-189](../src/renderer/hooks/use-editor-store.ts#L110-L189), [src/renderer/lib/recipe-from-timeline.ts:97,134-138,165-166](../src/renderer/lib/recipe-from-timeline.ts#L97-L166)
**Confidence:** 100%

Every consumer hard-codes `state.tracks[0].clips[0]`. The runtime invariant `assertSingleClipInvariant` *enforces* `length === 1`, contradicting the rationale that "components iterate the arrays" ([recipe-from-timeline.ts:5-7](../src/renderer/lib/recipe-from-timeline.ts#L5-L7)).

Forward-compat principle ("MVP without closing doors") is violated: v2 multi-clip will require rewriting every store mutator + Timeline + EditorView, not just lifting an invariant.

**Practical impact:** zero impact on MVP behavior; full rewrite cost when v2 expands.

**Fix sketch:** factor `getActiveClip(state)` / `updateActiveClip(state, fn)` helpers; rewrite store mutators against them. Components then iterate `tracks.flatMap(...)` even when N=1, so the iteration shape is real.

---

### HP-9. `editRecipeJson` is a write-only column on the reconcile path

**Files:** [src/main/use-cases/RenderCutFromVideo.ts:154,300](../src/main/use-cases/RenderCutFromVideo.ts#L154-L300), [src/main/use-cases/ReconcileDirectory.ts:24,458](../src/main/use-cases/ReconcileDirectory.ts#L24-L458)
**Confidence:** 100% on the reconcile path; 75% that no other code path reads it (CutDto unverified)

Editor writes `editRecipeJson` on Cut row insert (line 154) and writes `editRecipe` to `cut-data.json` (line 300). Reconcile types the sidecar field as `editRecipe?: unknown` (line 24) but **never parses it** — line 458 hardcodes `editRecipeJson: null` on disk-discovered cuts. So:
- A sideloaded cut whose folder contains a recipe never gets it into the DB.
- An editor-produced cut whose row was deleted (e.g. by recovery) and is later re-discovered by reconcile loses the recipe.
- The "v2 re-edit this cut" feature has no read path because `CutDto` doesn't expose `editRecipe` either (75% — agent claim, unverified).

**Practical impact:** the third validation boundary claimed by edit-recipe.ts:17-19 is unbuilt. The forward-compat seam is half-built.

**Fix sketch:** in `ReconcileDirectory.upsertCutFromDisk`, run `editRecipeSchema.safeParse(cutData?.editRecipe)` and persist on success. Surface `editRecipe: EditRecipe | null` on `CutDto`.

---

### HP-10. Reserved-op `canRender` rejection reason is dropped at the use-case

**Files:** [src/main/use-cases/RenderCutFromVideo.ts:78,214-219](../src/main/use-cases/RenderCutFromVideo.ts#L78-L219), [src/main/framework-drivers/ffmpeg/FfmpegRenderBackend.ts:30-39](../src/main/framework-drivers/ffmpeg/FfmpegRenderBackend.ts#L30-L39)
**Confidence:** 100%

`pickBackend` iterates and returns the first matching backend; on no match, `execute` throws a generic `'No render backend can handle this recipe (this should not happen in MVP)'`. The structured `reason` from `canRender({ ok: false, reason: 'Editor MVP supports a single trim op; got [concat, mute]' })` is discarded.

The doc-contract at [edit-recipe.ts:13-15](../src/shared/types/edit-recipe.ts#L13-L15) says backends "MUST `canRender()`-reject unknown ops with an explicit reason." The contract is honored at the backend; the use-case throws it away.

**Practical impact:** if a future client (or compromised renderer) sends a `concat` recipe, the user sees "this should not happen in MVP" instead of "concat is not yet supported."

**Fix sketch:** `pickBackend` collects rejection reasons; `execute` throws with a joined message. Add a typed error class so the renderer can render a user-friendly key.

---

### HP-11. `RenderCutOpPayload` declared twice (interface vs Zod schema, separate files)

**Files:** [src/main/use-cases/RenderCutFromVideo.ts:399-405](../src/main/use-cases/RenderCutFromVideo.ts#L399-L405), [src/main/use-cases/RecoverOperations.ts:42-48](../src/main/use-cases/RecoverOperations.ts#L42-L48)
**Confidence:** 100%

Writer side declares a TypeScript interface; reader side declares a Zod schema with the same shape. Adding a field on the writer silently drops it on read.

**Practical impact:** zero today (no field has been added). Forward-compat trap.

**Fix sketch:** declare the schema once next to `RenderCutFromVideo`; export `renderCutOpPayloadSchema` + `type RenderCutOpPayload = z.infer<...>`; `RecoverOperations` imports both.

---

## Must Investigate More

These are plausible issues backed by specific agent evidence I have NOT personally verified. Read the source before acting on any of them.

### MI-1. Empty `cutDir` becomes a phantom Cut row on next reconcile

**Agent claim referenced:** [src/main/use-cases/ReconcileDirectory.ts:405-453](../src/main/use-cases/ReconcileDirectory.ts#L405-L453)
**Confidence:** 65%

Agent reported that `discoverCuts` walks `cutsDir`, finds the empty `cutId` directory, runs `upsertCutFromDisk`, and at line 453 falls back to `filePath: mediaFile ? join(cutDir, mediaFile) : cutDir` — inserting a phantom row whose filePath is the directory itself.

**To verify:** read `ReconcileDirectory.ts` lines 405-460. Confirm:
1. `discoverCuts` enters empty directories.
2. The fallback at line 453 produces a row with no media file.
3. The guard at line 411 (`if (existing) ... continue`) does not save us in the orphan-after-cleanup case (because the row was already deleted).

If verified, this elevates HP-2 to a higher-impact issue.

---

### MI-2. `InMemoryEditorSessionStore` never deletes finalized sessions

**File:** `src/main/interface-adapters/editor/InMemoryEditorSessionStore.ts`
**Confidence:** 70%

Agent claimed `remove(jobId)` exists on the interface but is called from nowhere; `finalize` mutates state but does not free the entry. Each render leaks an `AbortController`.

**To verify:** read `InMemoryEditorSessionStore.ts` end-to-end + grep for `sessions.remove` callers across the project.

**Practical impact (if verified):** unbounded growth in long-running sessions; AbortController listeners pinned forever.

---

### MI-3. Recovery `deleteFile(stagingPath)` has no path-containment check

**File:** [src/main/use-cases/RecoverOperations.ts:277](../src/main/use-cases/RecoverOperations.ts#L277)
**Confidence:** 100% on the gap; 40% on threat severity

Personally verified the gap: line 277 calls `this.fsWriter.deleteFile(stagingPath)` with no `path.resolve` + `startsWith` check against the `.klip-render` root.

**Threat model:** an attacker who can write the local SQLite DB once (sideloaded backup, future cloud sync, malicious export tool) gets one arbitrary `unlink` per app launch. Low likelihood for klip's current threat model (single-user desktop app, no sync), but defensive depth costs ~20 lines.

**To investigate:** confirm whether klip's threat model treats local-DB-tampering as in-scope. If yes, fix is mandatory. If no, defer.

---

### MI-4. Watcher race depends on the undocumented `.klip-render` dotfile-prefix invariant

**File referenced:** `src/main/framework-drivers/file-system/ChokidarWatcher.ts:107-111`
**Confidence:** 60%

Agent claim: chokidar's ignore regex `/(^|[/\\])\../` matches the staging dir only because it starts with a dot. Rename it without the dot and the watcher would index it as a creator folder.

**To verify:** read ChokidarWatcher's ignore configuration; confirm the staging dir is excluded only by the dot prefix.

---

### MI-5. Editor window's "shared QueryClient" comment lies — it's per-window

**File:** [src/renderer/src/EditorApp.tsx:30-33](../src/renderer/src/EditorApp.tsx#L30-L33)
**Confidence:** 100%

Personally verified: each Electron `BrowserWindow` is a separate JS context; `queryClient` from `@/lib/query-client` is a module-level singleton **per renderer**, not shared. The comment claiming "DB-backed reads route through the same cache" is wrong.

**Combined with MI-6:** the editor window is invalidation-blind to changes in the main window.

---

### MI-6. Editor window does NOT mount `useDbListener`

**File:** [src/renderer/src/EditorApp.tsx](../src/renderer/src/EditorApp.tsx)
**Confidence:** 100%

Personally verified: `EditorBootstrap` mounts only `useRenderProgressListener`, `useHashChangeReload`, `useSourceVideoBootstrap`. The main window's `__root.tsx` mounts `useDbListener` to invalidate caches on `db-updated` events; the editor doesn't, so tag autocompletes etc. are stale forever within an editor session.

**Fix scope:** one-line addition to `EditorBootstrap`.

---

### MI-7. Editor window does NOT mount `<PreferencesBootstrap />`

**File:** [src/renderer/src/EditorApp.tsx](../src/renderer/src/EditorApp.tsx)
**Confidence:** 100%

Personally verified absent. Result: changing language in main settings doesn't update the editor window until reload.

**Fix scope:** one-line addition.

---

### MI-8. `editor-cancel-render` returns void; UI can't tell "cancelled" from "no-such-job"

**File:** `src/main/interface-adapters/controllers/EditorController.ts:35-37`
**Confidence:** 75%

Agent claim. Practical impact: stuck "Cancelling…" spinner when the job completes between user-click and IPC arrival.

**To verify:** read EditorController's cancel handler signature and trace the renderer call site.

---

### MI-9. Error messages cross IPC unredacted (full filesystem paths leak)

**Files:** [src/main/use-cases/RenderCutFromVideo.ts:87,321-330](../src/main/use-cases/RenderCutFromVideo.ts#L87-L330)
**Confidence:** 100%

Personally verified:
- Line 87: `throw new Error('Source video file is missing on disk: ${sourceVideo.filePath}')` — full path.
- Lines 321-330: `errorMessage: message` (raw `err.message`) sent across IPC; only the `console.error` at line 332 runs `redactError`.

**Practical impact:** screen-shares/log-pastes leak `C:\Users\<username>\...`. Privacy/portfolio polish issue.

**Fix scope:** wrap user-facing error strings in `redactError(err, this.rootPath.value)` before throw + emit.

---

### MI-10. Sidecar JSON not re-validated through Zod on read

**File:** [src/main/use-cases/ReconcileDirectory.ts:24,458](../src/main/use-cases/ReconcileDirectory.ts#L24-L458)
**Confidence:** 95%

Personally verified via grep: line 24 types the field as `editRecipe?: unknown`; line 458 hardcodes `editRecipeJson: null`. The sidecar field is never fed to `editRecipeSchema.safeParse`.

**To investigate:** confirm that fixing this won't break anything in disk-discovered cuts (e.g. a malformed sidecar from an older klip version that should be tolerated).

---

### MI-11. Save dialog: pressing Enter in title field does nothing

**File:** `src/renderer/components/features/editor/SaveCutDialog.tsx`
**Confidence:** 70%

Agent claimed no `<form onSubmit>` wrapping; the autofocused title input lacks a submit binding.

**To verify:** read SaveCutDialog. Plausible — Radix dialogs commonly omit a `<form>` element.

---

### MI-12. Save dialog: double-click submits twice (two phantom Cut rows)

**File:** `src/renderer/components/features/editor/SaveCutDialog.tsx`
**Confidence:** 65%

Agent claim: `submitting` is React state set after `handleSubmit` runs, so two fast clicks both pass the gate before React commits.

**To verify:** read SaveCutDialog's submit handler. If true, fix is a `submittingRef = useRef(false)` guard at the top.

---

### MI-13. `editRecipeJson` not surfaced through any IPC channel / `CutDto`

**File:** `src/shared/dtos/CutDto.ts`, `src/main/interface-adapters/controllers/dto-mappers.ts`
**Confidence:** 75%

Agent claim that `CutDto` does not expose `editRecipe` and `toCutDto` strips `editRecipeJson`. If true, no IPC path returns the recipe to the renderer — `timelineFromRecipe` (declared in `recipe-from-timeline.ts:129`) is unreachable at runtime.

**To verify:** read `CutDto.ts` and `dto-mappers.ts`. This is the second half of HP-9's "write-only column" — fix in the same PR.

---

## Notes on tier classification

- HP-1 to HP-7 are the seven items I called "top tier" in the synthesis.
- HP-8 to HP-11 were "forward-compat theatre" — verified at 100% confidence so they belong in High Priority, not in the speculative tier.
- MI-1 to MI-13 are the items I labeled "real bugs" plus the unverified 75%-confidence half of HP-9 (MI-13).
- Items I claimed without verifying any source (Tier 4 in the synthesis) and the test coverage gaps are tracked in the companion doc [editor-review-low-priority.md](editor-review-low-priority.md).

## Next step

Once the MI-* items are investigated and graduated to either "confirmed bug" or "ruled out," produce a fix plan covering all confirmed items, sequenced by blast-radius.
