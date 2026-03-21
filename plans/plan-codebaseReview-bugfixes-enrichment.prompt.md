# Plan: Codebase Review — Bug Fixes, Code Quality & Media Enrichment

## Context

A comprehensive codebase review was performed on 2026-03-20. It found critical bugs, architecture violations, code quality issues, and a missing feature (media metadata enrichment). This plan is split into two phases:

- **Plan A (this plan):** Critical bugs + code quality fixes — makes the backend ship-ready
- **Plan B (separate future plan):** New features — audit/operations IPC endpoints, IpcContract typed enforcement

## Decisions Made

- **Reconciliation stays synchronous** — the most critical, tested path stays untouched. Atomicity via `ITransactionScope` is preserved.
- **Media enrichment uses Option C** — entity-level `probeStatus` field + background async queue. No changes to reconciliation itself.
- **IpcContract typed helpers** — `createTypedHandler` / `createTypedInvoker` will enforce compile-time type safety (Plan B).
- **Renderer is untouched** — second phase of app, separate rules and implementation.

---

## Plan A: Critical Bugs + Code Quality

### Task 1: Fix `creator.name` → `creator.folderName` in ReconcileDirectory

**Bug:** `ReconcileDirectory` uses `creator.name` (display name) instead of `creator.folderName` (actual disk folder name) for all file system lookups. If a `creator.json` sets a different display name (e.g., `"name": "Mr Beast"` in folder `mrbeast/`), reconciliation will:

- Think the creator is **missing** and mark it + all children as missing
- Build incorrect file paths for video/cut subdirectories

**Why tests miss it:** Test factories always set `name === folderName === id`. No test covers the divergence case.

**Files to modify:**

- `src/main/use-cases/ReconcileDirectory.ts`

**Changes (8 occurrences):**

1. Line 84: `diskCreatorNames.has(creator.name)` → `diskCreatorNames.has(creator.folderName)`
2. Line 188: `this.path.join(rootPath, creator.name, 'downloads')` → `this.path.join(rootPath, creator.folderName, 'downloads')`
3. Line 218: `this.path.join(rootPath, creator.name, 'downloads')` → `this.path.join(rootPath, creator.folderName, 'downloads')`
4. Line 241: `this.path.join(rootPath, creator.name, 'downloads', videoId)` → `this.path.join(rootPath, creator.folderName, 'downloads', videoId)`
5. Line 272: `this.path.join(rootPath, creator.name, 'cuts')` → `this.path.join(rootPath, creator.folderName, 'cuts')`
6. Line 301: `this.path.join(rootPath, creator.name, 'cuts')` → `this.path.join(rootPath, creator.folderName, 'cuts')`
7. Line 324: `this.path.join(rootPath, creator.name, 'cuts', cutId)` → `this.path.join(rootPath, creator.folderName, 'cuts', cutId)`

**Tests to add** (in `tests/main/use-cases/ReconcileDirectory.test.ts`):

- Test case: creator with `folderName: 'mr-beast'` and `name: 'Mr Beast'` — disk folder is `mr-beast/`, reconciliation should find it via `folderName`, NOT `name`
- Test case: new creator discovered with `creator.json` containing `"name": "Display Name"` — verify `id` and `folderName` use the directory name, `name` uses the JSON value

---

### Task 2: Fix rootPath mismatch between container and app

**Bug:** `createAppContainer({ rootPath: defaultRootPath })` hardcodes the default `~/Documents/klip`. Then `index.ts` resolves the actual `rootPath` from the settings table (which may differ if the user changed it). But `ProcessFileNotifications`, `DownloadVideo`, and `ChokidarWatcher` were already created with the **default** path inside the container.

Result: if a user ever changed their root path, the file watcher watches the wrong directory, downloads save to the wrong folder, and granular reconciliation classifies against the wrong root.

**Files to modify:**

- `src/main/index.ts`
- `src/main/composition-root.ts`

**Approach:** Resolve the rootPath **before** creating the container. The composition root already accepts `AppConfig { dbPath, rootPath }` — we just need to pass the resolved value.

**Changes in `src/main/index.ts`:**

```
// Current (broken):
const defaultRootPath = join(app.getPath('documents'), 'klip')
const dbPath = join(app.getPath('userData'), 'klip.db')
container = createAppContainer({ dbPath, rootPath: defaultRootPath })
const storedRootPath = container.repositories.settings.get('rootPath')
const rootPath = storedRootPath ?? defaultRootPath

// Fixed — two-phase init:
// Phase 1: Open DB to read settings (lightweight, no container yet)
const defaultRootPath = join(app.getPath('documents'), 'klip')
const dbPath = join(app.getPath('userData'), 'klip.db')

// Resolve rootPath before container creation
const { initializeDatabase } = require('./framework-drivers/database')  // or use a lightweight settings reader
const tempDb = initializeDatabase(dbPath)
const storedRootPath = new SqliteSettingsRepository(tempDb.db).get('rootPath')
const rootPath = storedRootPath ?? defaultRootPath
tempDb.raw.close()

// Phase 2: Create container with resolved path
container = createAppContainer({ dbPath, rootPath })
```

**IMPORTANT:** The approach above opens and closes the DB twice. A cleaner alternative that avoids this:

**Preferred approach — split `createAppContainer` into two steps:**

Step 1: `index.ts` creates the database instance and resolves rootPath from settings.
Step 2: Pass both `database` and `rootPath` to `createAppContainer`.

```ts
// index.ts
const dbPath = join(app.getPath('userData'), 'klip.db')
const defaultRootPath = join(app.getPath('documents'), 'klip')
const database = initializeDatabase(dbPath)

// Resolve root from settings (DB is already open)
const settingsRepo = new SqliteSettingsRepository(database.db)
const storedRootPath = settingsRepo.get('rootPath')
const rootPath = storedRootPath ?? defaultRootPath
if (!storedRootPath) settingsRepo.set('rootPath', rootPath)

// Create container with resolved rootPath and pre-opened DB
container = createAppContainer({ database, rootPath })
```

**Changes in `src/main/composition-root.ts`:**

- Change `AppConfig` to `{ database: DatabaseInstance; rootPath: string }` (remove `dbPath`)
- Remove `initializeDatabase(config.dbPath)` call — use `config.database` directly
- Remove the `SqliteSettingsRepository` usage from `index.ts` post-container (it's now pre-container)

**Also update `registerReconcileController`:**

- It currently receives `rootPath` separately. After this fix, it can use the container's rootPath (passed through `config.rootPath`). Alternatively, keep it as-is since the value is now correct anyway.

**No test changes needed** — this is a wiring fix at the composition level (excluded from coverage).

---

### Task 3: Fix `PQueueDownloadQueue.pending()` and `.running()` swap

**Bug:** p-queue's API: `.size` = queued (waiting), `.pending` = currently running. The adapter maps them **backwards**.

**File to modify:**

- `src/main/interface-adapters/queue/PQueueDownloadQueue.ts`

**Changes:**

```ts
// Current (wrong):
pending(): number { return this.pQueue.pending }  // actually returns running count
running(): number { return this.pQueue.size }      // actually returns pending count

// Fixed:
pending(): number { return this.pQueue.size }      // p-queue .size = queued/waiting
running(): number { return this.pQueue.pending }   // p-queue .pending = currently running
```

**Tests to update** (in `tests/main/interface-adapters/queue/PQueueDownloadQueue.test.ts`):

- Replace the weak `typeof` assertion with a correctness assertion:
  - With 1 task running and 1 queued: `expect(q.running()).toBe(1)`, `expect(q.pending()).toBe(1)`

---

### Task 4: Fix unhandled promise rejection in `DownloadVideo.execute()`

**Bug:** `this.downloadQueue.enqueue(...)` returns a `Promise` that is neither `await`ed nor `.catch()`ed. While `performDownload` has its own try/catch, if the queue itself rejects (e.g., queue cleared during shutdown), the promise rejection is unhandled.

**File to modify:**

- `src/main/use-cases/DownloadVideo.ts`

**Change (line 64):**

```ts
// Current:
this.downloadQueue.enqueue(() => this.performDownload(downloadId, url, creatorName.trim()))

// Fixed:
this.downloadQueue
  .enqueue(() => this.performDownload(downloadId, url, creatorName.trim()))
  .catch((err) => console.error(`[klip] Download queue error (${downloadId}):`, err))
```

---

### Task 5: Extract duplicated `diffObjects` utility

**Issue:** Identical `diffObjects()` function copy-pasted in 3 audited decorator files.

**Files to modify:**

- Create `src/main/interface-adapters/repositories/diff-objects.ts`
- Update `AuditedCreatorRepository.ts`, `AuditedVideoRepository.ts`, `AuditedCutRepository.ts`

**New file `diff-objects.ts`:**

```ts
/**
 * Compute a JSON-serialized diff between two objects.
 * Skips `updatedAt` (always changes, not interesting for audit).
 * Returns null if no meaningful changes detected.
 */
export function diffObjects(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>
): string | null {
  const changes: Record<string, { old: unknown; new: unknown }> = {}
  for (const key of Object.keys(newObj)) {
    if (key === 'updatedAt') continue
    if (JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key])) {
      changes[key] = { old: oldObj[key], new: newObj[key] }
    }
  }
  return Object.keys(changes).length > 0 ? JSON.stringify(changes) : null
}
```

**Changes in each audited decorator:**

- Remove the local `diffObjects` function
- Add `import { diffObjects } from './diff-objects'`

---

### Task 6: Fix `ElectronBinaryResolver` module-level singleton

**Issue:** `const nodePathResolver = new NodePathResolver()` at module level violates "no module-level mutable singletons" and creates coupling between framework-drivers and interface-adapters layers.

**File to modify:**

- `src/main/framework-drivers/electron/ElectronBinaryResolver.ts`

**Change:** Since `ElectronBinaryResolver` is already a framework-driver (Node deps are allowed), replace the `NodePathResolver` usage with a direct `import { join } from 'path'`:

```ts
import { join } from 'path'
import { app } from 'electron'
import type { IBinaryResolver } from '@domain/ports'

// Remove: import { NodePathResolver } from '@main/interface-adapters/file-system'
// Remove: const nodePathResolver = new NodePathResolver()

export class ElectronBinaryResolver implements IBinaryResolver {
  resolve(name: 'yt-dlp' | 'ffprobe'): string {
    const platform = process.platform as SupportedPlatform
    const platformMap = BINARY_NAMES[name]
    const fileName = platformMap[platform] ?? platformMap['linux']

    if (app.isPackaged) {
      return join(process.resourcesPath, 'bin', fileName)
    }
    return join(app.getAppPath(), 'resources', 'bin', fileName)
  }
}
```

---

### Task 7: Fix `YtDlpDownloader.buildResult()` runtime `require()` calls

**Issue:** Uses `require('fs')` and `require('path')` at runtime instead of ES module imports. Hides dependencies from static analysis.

**File to modify:**

- `src/main/framework-drivers/yt-dlp/YtDlpDownloader.ts`

**Change:** Move to top-level imports (this file is already in framework-drivers, so Node deps are allowed):

```ts
// Add at top of file:
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'

// Remove from buildResult():
// const fs = require('fs') as typeof import('fs')
// const path = require('path') as typeof import('path')

// Replace all `fs.existsSync` → `existsSync`, `fs.readFileSync` → `readFileSync`, etc.
// Replace all `path.join` → `join`
```

---

### Task 8: Escape LIKE wildcards in search parameters

**Issue:** If a user types `%` or `_` in a search box, SQLite interprets them as LIKE wildcards, producing unexpected results.

**Files to modify:**

- `src/main/interface-adapters/repositories/SqliteCreatorRepository.ts`
- `src/main/interface-adapters/repositories/SqliteVideoRepository.ts`
- `src/main/interface-adapters/repositories/SqliteCutRepository.ts`

**Approach:** Create a shared escape helper and use SQLite's `ESCAPE` clause:

**New file `src/main/interface-adapters/repositories/escape-like.ts`:**

```ts
/**
 * Escape SQLite LIKE wildcards in a user-provided search string.
 * Uses backslash as the escape character (paired with ESCAPE '\' in the query).
 */
export function escapeLike(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&')
}
```

**Changes in each repository's `findPaginated`:**

```ts
// Current:
conditions.push(like(creators.name, `%${params.search}%`))

// Fixed:
import { escapeLike } from './escape-like'
import { sql } from 'drizzle-orm'
// ...
conditions.push(sql`${creators.name} LIKE ${'%' + escapeLike(params.search) + '%'} ESCAPE '\\'`)
```

---

### Task 9: Media Metadata Enrichment (Option C)

**Goal:** After reconciliation discovers new videos/cuts with null metadata, probe them asynchronously with ffprobe and persist `duration`, `resolution`, `fileSize`.

#### 9a. Schema migration — add `probeStatus` column

**File to modify:**

- `src/main/framework-drivers/database/schema.ts`

**Changes:**

- Add to `videos` table: `probeStatus: text('probe_status').notNull().default('pending')`
- Add to `cuts` table: `probeStatus: text('probe_status').notNull().default('pending')`

**Then run:** `npm run db:generate` to create migration SQL.

**Update `pushSchema()` in `database.ts`:**

- Add `probe_status TEXT NOT NULL DEFAULT 'pending'` to both CREATE TABLE statements.

#### 9b. Update domain entities

**Files to modify:**

- `src/main/domain/entities/Video.ts` — add `probeStatus: ProbeStatus`
- `src/main/domain/entities/Cut.ts` — add `probeStatus: ProbeStatus`

**New type** in `src/shared/types/` (or `src/main/domain/types/`):

```ts
export type ProbeStatus = 'pending' | 'complete' | 'failed'
```

#### 9c. Update shared DTOs

**Files to modify:**

- `src/shared/dtos/VideoDto.ts` — add `probeStatus: ProbeStatus`
- `src/shared/dtos/CutDto.ts` — add `probeStatus: ProbeStatus`

#### 9d. Update repository interfaces

**Files to modify:**

- `src/main/domain/repositories/IVideoRepository.ts` — add `findByProbeStatus(status: ProbeStatus): Video[]`
- `src/main/domain/repositories/ICutRepository.ts` — add `findByProbeStatus(status: ProbeStatus): Cut[]`

#### 9e. Update repository implementations

**Files to modify:**

- `src/main/interface-adapters/repositories/SqliteVideoRepository.ts`:
  - Update `mapRow` to include `probeStatus`
  - Add `findByProbeStatus` implementation
  - Update `upsert` values/conflict to include `probeStatus`
- `src/main/interface-adapters/repositories/SqliteCutRepository.ts`:
  - Update `mapRowToCut` to include `probeStatus`
  - Add `findByProbeStatus` implementation
  - Update `upsert` values/conflict to include `probeStatus`

#### 9f. Update audited decorators

**Files to modify:**

- `src/main/interface-adapters/repositories/AuditedVideoRepository.ts` — delegate new `findByProbeStatus`
- `src/main/interface-adapters/repositories/AuditedCutRepository.ts` — delegate new `findByProbeStatus`

#### 9g. New use case: `EnrichMediaMetadata`

**New files:**

- `src/main/use-cases/IEnrichMediaMetadata.ts`
- `src/main/use-cases/EnrichMediaMetadata.ts`

**Interface:**

```ts
export interface EnrichResult {
  videosProbed: number
  cutsProbed: number
  failures: number
}

export interface IEnrichMediaMetadata {
  execute(): Promise<EnrichResult>
}
```

**Implementation:**

```ts
export class EnrichMediaMetadata implements IEnrichMediaMetadata {
  constructor(
    private videoRepo: IVideoRepository,
    private cutRepo: ICutRepository,
    private mediaProbe: IMediaProbe,
    private notifier: INotifier
  ) {}

  async execute(): Promise<EnrichResult> {
    const result = { videosProbed: 0, cutsProbed: 0, failures: 0 }

    // Find entities needing probing
    const pendingVideos = this.videoRepo.findByProbeStatus('pending')
    const pendingCuts = this.cutRepo.findByProbeStatus('pending')

    // Probe videos
    for (const video of pendingVideos) {
      if (video.status !== 'active') continue
      try {
        const metadata = await this.mediaProbe.probe(video.filePath)
        this.videoRepo.upsert({
          ...video,
          duration: metadata.duration ?? video.duration,
          resolution: metadata.resolution ?? video.resolution,
          fileSize: metadata.fileSize ?? video.fileSize,
          probeStatus: 'complete',
          updatedAt: new Date().toISOString()
        })
        result.videosProbed++
      } catch {
        this.videoRepo.updateProbeStatus(video.id, 'failed')
        result.failures++
      }
    }

    // Probe cuts (same pattern)
    for (const cut of pendingCuts) {
      if (cut.status !== 'active') continue
      try {
        const metadata = await this.mediaProbe.probe(cut.filePath)
        this.cutRepo.upsert({
          ...cut,
          duration: metadata.duration ?? cut.duration,
          resolution: metadata.resolution ?? cut.resolution,
          fileSize: metadata.fileSize ?? cut.fileSize,
          probeStatus: 'complete',
          updatedAt: new Date().toISOString()
        })
        result.cutsProbed++
      } catch {
        this.cutRepo.updateProbeStatus(cut.id, 'failed')
        result.failures++
      }
    }

    // Notify UI if anything changed
    if (result.videosProbed > 0 || result.cutsProbed > 0) {
      this.notifier.notify('db-updated')
    }

    return result
  }
}
```

**Note:** `updateProbeStatus` is a new lightweight method to add to `IVideoRepository` and `ICutRepository` — avoids full upsert just to flip a status.

#### 9h. Wire into composition root

**File to modify:**

- `src/main/composition-root.ts`

**Changes:**

- Instantiate `EnrichMediaMetadata` with repo + mediaProbe + notifier dependencies
- Add to `AppContainer.useCases.enrichMedia`

#### 9i. Wire into startup and watcher flush

**File to modify:**

- `src/main/index.ts` — call `container.useCases.enrichMedia.execute()` after initial reconciliation (async, fire-and-forget with error logging)
- `src/main/use-cases/ProcessFileNotifications.ts` — call `enrichMedia.execute()` after both `reconcile.execute()` and `processGranular()` complete in `flush()`

**ProcessFileNotifications changes:**

- Accept `IEnrichMediaMetadata` as constructor dependency
- After reconciliation in `flush()`:
  ```ts
  this.notifier.notify('db-updated')
  // Enrich metadata for newly discovered entities (non-blocking)
  this.enrichMedia.execute().catch((err) => console.error('[klip] Enrichment failed:', err))
  ```

#### 9j. Tests

**New test file:** `tests/main/use-cases/EnrichMediaMetadata.test.ts`

Test cases:

- Probes pending videos and updates metadata + probeStatus to 'complete'
- Probes pending cuts and updates metadata + probeStatus to 'complete'
- Marks probeStatus as 'failed' when ffprobe throws
- Skips non-active entities (status = 'missing' or 'deleted')
- Sends 'db-updated' notification when at least one entity was probed
- Does NOT send 'db-updated' when nothing to probe
- Returns correct counts in EnrichResult

**Update existing tests:**

- `ReconcileDirectory.test.ts` — update `makeVideo` / `makeCut` factories to include `probeStatus: 'pending'`
- Repository tests — verify `findByProbeStatus` and `updateProbeStatus` methods
- `ProcessFileNotifications.test.ts` — verify enrichMedia is called after flush

---

## Execution Order

1. **Task 1** — Fix `creator.folderName` bug (critical, standalone)
2. **Task 3** — Fix PQueueDownloadQueue swap (quick, standalone)
3. **Task 4** — Fix unhandled promise (quick, standalone)
4. **Task 5** — Extract `diffObjects` (standalone refactor)
5. **Task 6** — Fix ElectronBinaryResolver singleton (standalone)
6. **Task 7** — Fix YtDlpDownloader require() (standalone)
7. **Task 8** — Escape LIKE wildcards (standalone)
8. **Task 2** — Fix rootPath mismatch (touches index.ts + composition-root, do after other fixes are stable)
9. **Task 9a–9c** — Schema migration + entity/DTO updates (foundation for enrichment)
10. **Task 9d–9f** — Repository interface/impl updates
11. **Task 9g** — EnrichMediaMetadata use case
12. **Task 9h–9i** — Wiring (composition root + startup + watcher flush)
13. **Task 9j** — Tests for enrichment
14. **Run `npm run test:coverage`** — verify all tests pass, coverage thresholds met
15. **Run `npm run typecheck`** — verify no type errors
16. **Run `npm run lint`** — verify no lint issues

---

## Plan B (Future — Separate Plan File)

These items were identified in the review but deferred:

1. **Audit log & operations IPC endpoints** — read-only viewing for the renderer. Future foundation for CTRL+Z undo system.
2. **IpcContract typed enforcement** — `createTypedHandler<C>()` / `createTypedInvoker<C>()` helpers that extract types from `IpcContract` for compile-time safety.
3. **`AppSetting` entity** — currently defined but never used (repository returns raw strings). Wire it into `ISettingsRepository` or remove it.
4. **`findAll()` / `findAllActive()` / hard `delete()` audit** — several repository methods are defined but never called from use-cases or controllers. Evaluate which are needed vs. can be pruned.
5. **`DownloadVideo` `randomUUID` import** — use-case imports `crypto` directly (Node built-in). Consider adding an `IIdGenerator` port for full DI compliance, or accept this as pragmatic.

---

## Validation Checklist

After all tasks are complete:

- [ ] `npm run test:coverage` passes with ≥80% coverage
- [ ] `npm run typecheck` passes clean
- [ ] `npm run lint` passes clean
- [ ] `npm run dev` starts without errors
- [ ] Manual test: create a folder with `creator.json` containing a different `name` than the folder — reconciliation handles it correctly
- [ ] Manual test: newly discovered videos/cuts get `duration`, `resolution`, `fileSize` populated after a few seconds
- [ ] Old `klip.db` is deleted (migration adds new columns) OR migration applies cleanly
