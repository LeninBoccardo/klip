# Audit 02 — Weird Logic

**Method:** read every public method across the 7 surfaces (file watcher chain, audited repository decorators, multi-step sagas, queues, use cases, controllers, renderer hooks). Cross-referenced with grep for `catch {}`, `void asyncFn()`, `Promise.all`, `setTimeout`, `.then(...)` without `.catch`. Confidence bar: read + reason (some findings may be rejected at triage).

**Severity bar:** impactful only — bugs that produce wrong output for some input, or smells that meaningfully increase risk. Pure style is excluded.

**Result groups:**

- **BUGS** — will produce wrong output for some realistic input.
- **SMELLS** — suspicious; probably fine today but degrades over time or under load.

---

## BUGS

### B1. `MigrateRootFolder` DB updates are not atomic — partial state on failure

**Location:** [src/main/use-cases/MigrateRootFolder.ts:138–161](src/main/use-cases/MigrateRootFolder.ts)

Four sequential writes after the file moves succeed:

```ts
this.videoRepo.updateFilePathPrefix(oldRootPath, newRootPath) // (1)
this.cutRepo.updateFilePathPrefix(oldRootPath, newRootPath) // (2)
this.settingsRepo.set('rootPath', newRootPath) // (3)
this.rootPathRef.value = newRootPath // (4)
```

Each is a separate SQLite statement (and each `updateFilePathPrefix` is itself a write + audit log append, so really 6+ statements). They are **not** wrapped in `transactionScope.run(…)`. If statement (2) or (3) fails, the previous writes have already committed, leaving the DB inconsistent: `rootPath` setting could be old while video paths point to new (or vice versa), audit log half-populated.

The error path at line 149–161 catches the throw, marks the operation `failed`, restarts the watcher, and returns — but leaves the DB in the partial state. The catch comment "this is a critical state" acknowledges the risk; nothing is done about it.

**Recommendation:** inject `ITransactionScope` and wrap lines 145–148 in `this.transaction.run(() => { … })`. On throw, all writes roll back; the file moves stand and the rollback path can move them back via the existing `rollbackMovedFolders` helper (which currently only runs for the move-loop catch, not the DB-update catch).

---

### B2. `RecoverOperations` for `migrate_root` only updates DB — physical files are left mid-migration

**Location:** [src/main/use-cases/RecoverOperations.ts:94–98](src/main/use-cases/RecoverOperations.ts)

```ts
private recoverMigrateRootOp(op: Operation): boolean {
  // Partial root migrations are unsafe to resume — always roll back
  this.markRolledBack(op.id, 'Root migration interrupted — rolled back for safety')
  return false
}
```

The comment says "rolled back for safety". The implementation only updates `operations.status = 'rolled_back'`. **No filesystem rollback happens.** If the app crashed mid-migration with N folders moved, those N folders stay at the new root, the rest stay at the old root, and `settings.rootPath` could be either. The `payload.movedSoFar` array contains exactly the info needed to move them back — but it's not read.

User-visible effect: silent data inconsistency after a crash during migration. Library appears half-empty in the UI; user has to manually merge two folders.

**Recommendation:** read `payload`, move every folder in `movedSoFar` back from `payload.newRoot` to `payload.oldRoot`, then mark `rolled_back`. Reuse the same loop as `MigrateRootFolder.rollbackMovedFolders`. If any individual rollback fails, log + continue (best-effort), and surface the list of stranded folders in the operation's `error` field.

---

### B3. Audited repository writes are not atomic with the mutation they describe

**Location:** [src/main/interface-adapters/repositories/AuditedCreatorRepository.ts](src/main/interface-adapters/repositories/AuditedCreatorRepository.ts), [AuditedVideoRepository.ts](src/main/interface-adapters/repositories/AuditedVideoRepository.ts), [AuditedCutRepository.ts](src/main/interface-adapters/repositories/AuditedCutRepository.ts)

Each `upsert` / `updateStatus` / `delete` / `updateProbeStatus` / `updateFilePathPrefix` does:

```ts
this.inner.<mutation>(...)        // write 1: the change
this.auditLog.append({ ... })     // write 2: the audit record
```

These are two separate SQLite statements. With WAL mode, both individually are durable, but **between** the two there is a window where the mutation has committed and the audit hasn't. A crash there leaves the audit log silently lying about state changes.

Where this matters today:

- `Reconcile` wraps everything in `transactionScope.run(…)` ✅ safe
- `MigrateRootFolder.updateFilePathPrefix` calls (see B1) — not wrapped ❌
- `delete-creator` / `delete-video` / `delete-cut` / `restore-*` controllers — not wrapped ❌
- `EnrichMediaMetadata` per-entity probe upserts — not wrapped ❌
- `DownloadVideo.performDownload` → `videoRepo.upsert` + `creatorRepo.upsert` — not wrapped ❌
- `FetchVideoDetail`, `FetchChannelInfo` — not wrapped ❌

**Recommendation (low-effort):** push the transaction inside the audited decorator. Pass `ITransactionScope` into each `Audited*Repository` and wrap each mutation method's two writes:

```ts
upsert(creator: Creator): void {
  this.transaction.run(() => {
    const existing = this.inner.findById(creator.id)
    this.inner.upsert(creator)
    this.auditLog.append({ … })
  })
}
```

Reconcile's outer transaction nests safely under SQLite's `SAVEPOINT` semantics (better-sqlite3 nests). All callers immediately gain atomic mutation+audit without changes.

This is the highest-leverage fix in the whole audit.

---

### B4. Reconciliation thumbnail regex doesn't match yt-dlp's output filename

**Location:** [src/main/use-cases/ReconcileDirectory.ts:256](src/main/use-cases/ReconcileDirectory.ts), [:351](src/main/use-cases/ReconcileDirectory.ts)

```ts
const thumbFile = files.find((f) => /^thumbnail\.(jpg|jpeg|png|webp)$/i.test(f)) ?? null
```

Anchored regex requires the literal name `thumbnail.<ext>`. But yt-dlp, configured at [YtDlpDownloader.ts:282](src/main/framework-drivers/yt-dlp/YtDlpDownloader.ts) with `-o ${outputDir}/${videoId}.%(ext)s --write-thumbnail --convert-thumbnails jpg`, writes the thumbnail as `<videoId>.jpg`. The reconciler regex never matches it.

When does this matter?

- Normal download flow: `DownloadVideo.performDownload` writes the Video entity directly with the thumbnail path discovered by `YtDlpDownloader.buildResult` (looser regex). ✅ fine.
- **Reconciliation flow:** if a video appears via reconciliation (sideloaded by user, copied from another klip instance, or recovered after a `DownloadVideo` DB-write failure), the thumbnail is on disk but `thumbnailPath` is set to `null`. UI shows a broken thumbnail forever (or until the user moves the file to `thumbnail.jpg`).

The video file regex on the line above accepts `<videoId>.mp4` (extension-only check), so the inconsistency is specifically in the thumbnail check.

**Recommendation:** broaden the thumbnail regex to match either `thumbnail.<ext>` OR any file with a thumbnail-like extension that isn't `.info.<ext>`. The existing buildResult logic in YtDlpDownloader is a reasonable model: `/\.(jpg|jpeg|png|webp)$/i.test(f) && !f.includes('.info.')`.

---

### B5. `ChokidarWatcher.stop()` is fire-and-forget; concurrent watchers possible during `restart()`

**Location:** [src/main/framework-drivers/file-system/ChokidarWatcher.ts:71–74](src/main/framework-drivers/file-system/ChokidarWatcher.ts)

```ts
if (this.watcher) {
  void this.watcher.close()
  this.watcher = null
}
```

`FSWatcher.close()` is async (returns a Promise). The `void` discards it. `restart(newRootPath)` calls `stop()` then `start()` immediately — `start()` creates a new watcher (line 115) before the old one's close has finished. For a brief window, two watchers are alive and both fire events, causing duplicate events to flow into `ProcessFileNotifications`.

This matters during `MigrateRootFolder` execution: it calls `fileWatcher.stop()` then later `fileWatcher.restart(newRootPath)`. The new watcher could begin emitting `addDir` events for the new root while the old watcher is still emitting `unlinkDir` events from the old root. `collapseEvents` operates per-path; events from disjoint roots don't collapse. Result: some spurious "unlink" events that the next reconcile correctly ignores. Not catastrophic, but confusing in logs and a real correctness violation of the suspend/resume contract.

**Recommendation:** make `stop()` and `restart()` async; await `this.watcher.close()` before nulling and creating a new one. Update the `IFileWatcher` interface signature. Callers (composition root and `MigrateRootFolder`) need to await — both are already in async contexts.

---

## SMELLS

### S1. `MigrateRootFolder` watcher can stay suspended forever on early throw

**Location:** [src/main/use-cases/MigrateRootFolder.ts:82–106](src/main/use-cases/MigrateRootFolder.ts)

```ts
this.processNotifications.suspend()
this.fileWatcher.stop()
const folders = this.fsReader.listDirectories(oldRootPath)
const operationId = this.idGenerator.generate()
…
this.operationRepo.create({ … })       // could throw (DB constraint)
this.operationRepo.updateStatus(operationId, 'in_progress')  // could throw
```

If anything between line 82 (suspend) and line 109 (try-block) throws, the watcher is suspended and the DB is in `pending` state with no resume path. The next user action that depends on file watcher events silently doesn't work until app restart.

**Recommendation:** wrap the entire migration body in try/finally to guarantee `processNotifications.resume()` and (if applicable) `fileWatcher.restart(currentRoot)`.

---

### S2. `MigrateRootFolder` doesn't write `startedAt`, doesn't emit `phase: 'rolling_back'`

**Location:** [src/main/use-cases/MigrateRootFolder.ts:96–106, 187–205](src/main/use-cases/MigrateRootFolder.ts)

- `startedAt` is initialized to `null` and never updated — the `operations.started_at` column is always null, even for completed operations. Audit/diagnostics value lost.
- The rollback path (`rollbackMovedFolders`) doesn't emit `migrate-root-progress` events with `phase: 'rolling_back'`. The renderer's blocking dialog continues to show "moving" while files are being moved back.

**Recommendation:** set `startedAt` when transitioning to `in_progress`. Emit a `phase: 'rolling_back'` progress event at the start of rollback, with current/total reflecting `movedSoFar.length`.

---

### S3. `RecoverOperations.recoverRenameFolderOp` and `recoverBulkImportOp` are aspirational

**Location:** [src/main/use-cases/RecoverOperations.ts:63–104](src/main/use-cases/RecoverOperations.ts)

`OperationType` includes `'rename_folder'` and `'bulk_import'`, but no use case ever creates operations of these types. The recovery branches are dead code. They lie in wait for features that don't exist yet.

**Recommendation:** either delete the branches (and the corresponding `OperationType` variants) until the features land, or annotate clearly that they're forward-looking placeholders. Currently the comment "rolled back for safety" implies a real safety net that doesn't exist.

(Overlaps with Audit 01 dead-code findings — kept here because the misleading comment is the smell.)

---

### S4. `EnrichMediaMetadata` swallows ffprobe errors silently

**Location:** [src/main/use-cases/EnrichMediaMetadata.ts:41, 61](src/main/use-cases/EnrichMediaMetadata.ts)

```ts
} catch {
  this.videoRepo.updateProbeStatus(video.id, 'failed')
  result.failures++
}
```

The error is discarded. `result.failures` reports a count but no reason. Debugging "why did probe fail for this video?" requires reproducing the issue manually; logs are silent.

**Recommendation:** `} catch (err) { console.error('[klip] ffprobe failed for video', video.id, err); … }`. Same for the cut branch. Two lines, large debugging payoff.

---

### S5. `FetchVideoDetail` swallows transcript fetch errors

**Location:** [src/main/use-cases/FetchVideoDetail.ts:43–47](src/main/use-cases/FetchVideoDetail.ts)

```ts
} catch {
  // Transcript fetch is best-effort — leave null on failure
  transcriptPath = null
  transcriptText = null
}
```

The intent (best-effort) is correct, but logging the swallowed error helps diagnose issues like "transcript never works for this video" or "yt-dlp version regression". One `console.warn` line.

**Recommendation:** `} catch (err) { console.warn('[klip] Transcript fetch failed for', video.id, err); … }`.

---

### S6. `EnrichAllVideos` comment lies about queue concurrency, no batch progress events

**Location:** [src/main/use-cases/EnrichAllVideos.ts:11–13, 31–43](src/main/use-cases/EnrichAllVideos.ts)

The class comment says: _"Calls are funneled through `IDownloadQueue` (concurrency 1)"_. But the queue is constructed with concurrency `2` in [composition-root.ts:144](src/main/composition-root.ts) and is **shared** with active downloads. So:

- Comment is wrong (concurrency is 2 globally, not 1).
- The `for…of await` inside the loop forces sequential per-video enrichment, but if a download is in-flight, enrichment competes for the same slot.
- No progress events to renderer during a long batch — Settings page just spinners.

**Recommendation:**

- Fix the comment to match reality, OR give EnrichAllVideos its own dedicated queue (concurrency 1, separate `PQueueDownloadQueue` instance) so YouTube rate-limit pressure is bounded predictably.
- Emit a notification event after each video processed: `notifier.notify('enrich-progress', { current, total, enriched, failed, skipped })`. Renderer can subscribe and update a Settings card progress bar.

---

### S7. `DownloadVideo.ensureCreator` doesn't backfill YT metadata on `'missing'` recovery

**Location:** [src/main/use-cases/DownloadVideo.ts:187–198](src/main/use-cases/DownloadVideo.ts)

```ts
if (!existing) {
  // upsert with full metadata ✅
} else if (existing.status === 'missing') {
  this.creatorRepo.updateStatus(folderName, 'active', null) // no metadata refresh
} else if (!existing.youtubeChannelId && info.channelId) {
  // backfill ✅
}
```

The middle branch (missing creator → recovered) **doesn't backfill** YouTube metadata even when `info.channelId` is now available. So a creator that was discovered via reconciliation (no YT metadata), then went missing, then came back via a download, ends up `active` with `youtubeChannelId: null` despite having the data.

**Recommendation:** in the missing branch, also pass through the metadata-backfill logic (or restructure to always check the metadata-missing condition independently of status).

---

### S8. `DownloadVideo` notifies renderer on every yt-dlp progress tick (no debounce)

**Location:** [src/main/use-cases/DownloadVideo.ts:105–107](src/main/use-cases/DownloadVideo.ts)

```ts
const onProgress = (progress: DownloadProgress): void => {
  this.notifier.notify('download-progress', progress)
}
```

yt-dlp emits progress lines several times per second. Each call invokes `webContents.send` to all renderer windows. With multiple concurrent downloads (concurrency 2), 10–20 IPC messages/sec is realistic. Renderer's zustand store handles each via `upsertDownload`, triggering re-render of `ActiveDownloadsList`.

Probably fine in practice (Electron IPC is fast; the renderer dedupes via React reconciliation), but a clear debounce / throttle (e.g., 200ms) on the main side would be cheap insurance.

**Recommendation:** wrap `notify` in a per-`downloadId` throttle (4–5 events/sec is plenty for a UX-acceptable progress bar).

---

### S9. `ProcessFileNotifications.suspend()` doesn't await an in-flight flush

**Location:** [src/main/use-cases/ProcessFileNotifications.ts:65–68](src/main/use-cases/ProcessFileNotifications.ts)

```ts
suspend(): void {
  this.suspended = true
  this.debouncer.cancel()
}
```

If a flush is mid-`await this.queue.drain()` when `suspend()` is called, the flush continues to completion (it doesn't check `this.suspended` after re-entering the body). It will call `reconcile.execute(this.rootPath.value)` — potentially using the **old** rootPath if `MigrateRootFolder` is mid-migration but already updated `rootPathRef.value`. Followed by `this.notifier.notify('db-updated')` and a fire-and-forget `enrichMedia.execute()`.

`MigrateRootFolder` calls `this.processNotifications.suspend()` then synchronously `this.fileWatcher.stop()`. If a flush is mid-flight at that exact moment, the next several lines of MigrateRoot run while the flush still races to completion.

**Recommendation:** make `suspend()` async, return a promise that resolves once any in-flight flush has settled. Track `flushing` as a `Promise<void> | null`; in `suspend()`, `await this.currentFlush ?? Promise.resolve()`.

---

### S10. `ProcessFileNotifications.flush()` fires `enrichMedia` without waiting

**Location:** [src/main/use-cases/ProcessFileNotifications.ts:119](src/main/use-cases/ProcessFileNotifications.ts)

```ts
this.enrichMedia?.execute().catch((err) => console.error('[klip] Enrichment failed:', err))
```

Two flushes within a few seconds (large burst) can each fire `enrichMedia.execute()`. The use case queries `findByProbeStatus('pending')` — both invocations may pick up the same pending items, and the second probe is wasted (probe overrides any in-progress one). With the audit decorator's transaction-less mutations (B3), a race between two probe upserts could even mis-report counts.

**Recommendation:** track an internal `enrichInFlight: Promise | null` in `ProcessFileNotifications`; only fire when null. Also probably worth exposing a public method `enrichMedia.executeOnce()` that returns the in-flight promise if already running.

---

### S11. `set-setting` has no key/value validation — `rootPath` is settable directly

**Location:** [src/main/interface-adapters/controllers/SettingsController.ts:28–30](src/main/interface-adapters/controllers/SettingsController.ts)

```ts
createTypedHandler('set-setting', async (_event, key, value) => {
  settingsRepo.set(key, value)
})
```

Any IPC call can write any setting key. A renderer bug (or a future code path that calls `setSetting('rootPath', '/somewhere/else')`) would bypass `MigrateRootFolder` entirely, leaving DB paths broken and the watcher pointing at the wrong directory.

The renderer doesn't currently expose this, but the controller is a foot-gun.

**Recommendation:** allowlist the keys that `set-setting` accepts (probably none — settings reads are fine, but writes should go through dedicated controllers like `migrate-root`). Or at least reject `rootPath` and tell callers to use `migrate-root`.

---

### S12. `select-folder` uses `getFocusedWindow()` — fragile

**Location:** [src/main/interface-adapters/controllers/SettingsController.ts:36–49](src/main/interface-adapters/controllers/SettingsController.ts)

```ts
const win = BrowserWindow.getFocusedWindow()
if (!win) return null
```

If the user clicks "Select folder" but the Electron window momentarily loses focus (e.g., a system notification, multi-monitor focus glitch), `getFocusedWindow()` returns null and the dialog silently doesn't open. The renderer gets `null` and may interpret it as "user cancelled".

**Recommendation:** use `BrowserWindow.fromWebContents(_event.sender)` to get the calling window. This is exactly the use case Electron's invoke event was designed for. Available because `_event` is the IPC invoke event with `.sender`.

---

### S13. `use-db-listener.ts` invalidates ALL queries on every `db-updated`

**Location:** [src/renderer/hooks/use-db-listener.ts:14–16](src/renderer/hooks/use-db-listener.ts)

```ts
const unsubscribe = window.api.onDbUpdated(() => {
  queryClient.invalidateQueries()
})
```

`invalidateQueries()` with no args invalidates EVERY query in the cache — creators, videos, cuts, settings, audit log, operations, transcript, comments. Each visible query refetches. A reconcile that adds 1 video causes the entire cache to refetch.

The push payload is currently `void` so we don't know what changed. But by entity type would be a big win. Even nuclear-on-bulk-events but targeted-on-single-event (via debouncing the listener and inspecting recent state) would help.

**Recommendation:** consider extending the `'db-updated'` payload to `{ entities: ('creator' | 'video' | 'cut')[] }` and invalidating only those query trees. Step-3 (Performance) territory; flagged here because it sits on the edge of correctness (stale queries while invalidation cascades through 8+ trees can show flicker).

---

### S14. `useCheckForUpdates.onSuccess` writes the cache redundantly with the push event

**Location:** [src/renderer/hooks/use-updater.ts:30–34](src/renderer/hooks/use-updater.ts)

```ts
return useMutation({
  mutationFn: () => window.api.checkForUpdates(),
  onSuccess: (status) => qc.setQueryData(queryKeys.updater.status, status)
})
```

The main-process driver's `onStatusChange` listener pushes `updater-status` events that already update the cache via `useUpdaterStatus`'s subscription. So `onSuccess` writes the same data the push event will deliver moments later (or has already delivered). Harmless redundancy; could be removed for clarity.

**Recommendation:** drop `onSuccess`. The push subscription is the source of truth for cache state.

---

### S15. `UpdaterToastWatcher` includes a mutation object in its useEffect deps

**Location:** [src/renderer/src/routes/\_\_root.tsx:43–60](src/renderer/src/routes/__root.tsx)

```ts
useEffect(() => {
  …
}, [status, installUpdate])
```

`useInstallUpdate()` returns a TanStack Query mutation result whose object identity changes on every render of the component. So this effect re-runs on every render, not just on status change. The `notifiedFor` ref guard prevents duplicate toasts, so behavior is correct, but the effect re-running per render is wasteful and confusing to read.

**Recommendation:** capture `installUpdate.mutate` in a `useCallback` or just inline `() => installUpdate.mutate()` and drop `installUpdate` from deps (the `mutate` function is stable per TanStack Query docs). Or just `[status]`.

---

### S16. `useAppStore.startBlockingOperation` doesn't guard against double-start

**Location:** [src/renderer/hooks/use-app-store.ts:49–50](src/renderer/hooks/use-app-store.ts)

```ts
startBlockingOperation: (title, description) =>
  set({ blockingOperation: { title, description } }),
```

If two blocking operations are kicked off in quick succession (e.g., user double-clicks "Migrate root"), the second clobbers the first's progress state. The first operation completes silently underneath. Probably fine in practice (Migrate is the only blocking op today, and the button disables itself), but worth a guard.

**Recommendation:** in the setter, no-op if `state.blockingOperation !== null`. Or surface it as a `"another operation in progress"` toast.

---

### S17. `PQueueDownloadQueue.pending()` and `running()` are semantically inverted relative to p-queue's vocabulary

**Location:** [src/main/interface-adapters/queue/PQueueDownloadQueue.ts:19–25](src/main/interface-adapters/queue/PQueueDownloadQueue.ts)

```ts
pending(): number { return this.pQueue.size }      // p-queue's "size" = waiting tasks
running(): number { return this.pQueue.pending }   // p-queue's "pending" = in-flight tasks
```

The naming flip across the abstraction is intentional ("pending" in our domain = "waiting in queue", "running" = "in-flight"), but reading the code feels off because `this.pQueue.pending` is what we expose as `running()`. A reader debugging this is one click away from the wrong mental model.

**Recommendation:** add a brief comment above each method explaining the inversion, OR rename to match the underlying library (`waiting()` / `inFlight()`).

---

## Summary

| Severity | Count | Surface mostly affected                                                           |
| -------- | ----- | --------------------------------------------------------------------------------- |
| BUGS     | 5     | Migrate saga (×2), audited repos, reconcile thumbnail regex, file watcher restart |
| SMELLS   | 17    | Distributed across all 7 surfaces                                                 |

**Highest-leverage fixes (single-PR-worth):**

1. **B3** — push `ITransactionScope` into `Audited*Repository` decorators. Fixes B3 fully and prevents future occurrences. Touches 4 files (3 audited repos + composition root).
2. **B1** — wrap `MigrateRootFolder`'s 4 post-move writes in a transaction (will reuse the `ITransactionScope` injected for B3).
3. **B2** — read `payload.movedSoFar` in `RecoverOperations.recoverMigrateRootOp` and physically move folders back. Closes the data-loss window on crash-during-migration.
4. **B4** — broaden the thumbnail regex in `ReconcileDirectory`.
5. **B5** — make `ChokidarWatcher.stop()` await `close()`.

The 17 smells are small individually; suggest grouping them into 3 batches:

- **Logging hygiene:** S4, S5 (and a related general pass on swallowed errors).
- **Atomicity / concurrency:** S9, S10 (related to B3).
- **UI feedback / hygiene:** S2, S6, S8, S13, S14, S15, S16.

Settings/IPC hardening (S11, S12) overlaps with the upcoming Step 6 security audit — defer to that pass to avoid double-fixing.

**Next step:** triage with the user. For each finding, mark `fix / defer / reject`. After fix pass lands and tests pass, move to Step 3 — Performance.
