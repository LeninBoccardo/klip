# Plan: File Watcher System (chokidar → Queue Integration)

## Status: IMPLEMENTED ✅

## Overview

Added a chokidar-based file watcher (`ChokidarWatcher`) that monitors the root directory for runtime file-system changes and feeds them into the existing notification queue pipeline (`ProcessFileNotifications` → collapse → threshold → reconcile → notify renderer).

Startup uses an explicit `reconcile.execute(rootPath)` call for a single consistent full scan. The watcher runs with `ignoreInitial: true` so it only captures **runtime changes** after that.

## What Was Built

### Domain Layer

| File                                    | Purpose                                            |
| --------------------------------------- | -------------------------------------------------- |
| `src/main/domain/ports/IFileWatcher.ts` | Port interface: `start()`, `stop()`, `onEvent(cb)` |

### Framework-Driver Layer

| File                                                        | Purpose                                                                                                                                              |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main/framework-drivers/file-system/ChokidarWatcher.ts` | Implements `IFileWatcher` using chokidar v5. Pre-filters irrelevant paths, auto-creates root dir with retry, uses `awaitWriteFinish` for large files |

### Wiring

| File                | Change                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main/index.ts` | Added: explicit startup reconciliation, `ChokidarWatcher` instantiation + event wiring, graceful shutdown via `app.on('before-quit')` |
| `vitest.config.ts`  | Added `src/main/framework-drivers/file-system/**` to coverage exclusions                                                              |
| `AGENTS.md`         | Updated framework-drivers description + coverage exclusion list                                                                       |

## Startup Sequence

```
app.whenReady() →
  1. createDb()                                      (existing)
  2. ReconcileDirectory + controller setup            (existing)
  3. ProcessFileNotifications + queue setup            (existing)
  4. reconcile.execute(rootPath)                       (NEW — one-time full scan)
  5. ChokidarWatcher(rootPath) → watcher.start()      (NEW — runtime changes)
  6. createWindow()                                   (existing)
```

## Chokidar Configuration

```typescript
chokidar.watch(rootPath, {
  persistent: true,
  ignoreInitial: true, // startup scan is explicit reconciliation
  depth: 4, // root / creator / downloads|cuts / id / file
  awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  ignored: [/(^|[/\\])\./, /node_modules/, /\.DS_Store/]
})
```

## Path Pre-Filtering

`ChokidarWatcher.isRelevant()` filters events before they reach the queue:

- **Directory events**: accepted for creator dirs (`/CreatorName/`) and entity subdirs (`/CreatorName/downloads/...`, `/CreatorName/cuts/...`)
- **File events**: must match the folder structure AND have a relevant extension (`.mp4`, `.mkv`, `.webm`, `.jpg`, `.jpeg`, `.png`, `.webp`, `meta.json`, `cut-data.json`, `creator.json`)
- **Everything else**: silently dropped (e.g., `.txt` files, random files in root)

## Root Directory Handling

If `documents/klip` doesn't exist at startup:

1. Attempt `mkdirSync(rootPath, { recursive: true })`
2. On failure, retry every 3s up to 20 times (60s total)
3. After max retries, log error and stop (watcher won't start)

## Graceful Shutdown

`app.on('before-quit')` calls:

- `fileWatcher.stop()` — closes chokidar handles
- `debouncer.cancel()` — prevents flush after DB connection closes

## Design Decisions

| Decision                 | Value                                            | Rationale                                                                                                                                              |
| ------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ignoreInitial: true`    | Explicit reconciliation at startup               | Avoids multiple partial reconciliations from async chokidar discovery. Single consistent scan guaranteed.                                              |
| `awaitWriteFinish`       | `{ stabilityThreshold: 500, pollInterval: 100 }` | Handles large .mp4 exports still being written. Confirmed available in chokidar v5.                                                                    |
| Path pre-filtering       | Regex in `isRelevant()`                          | Keeps queue lean — irrelevant files never enter the pipeline. Pure efficiency gate, no domain logic.                                                   |
| Soft-delete on unlinkDir | Via reconciliation convention                    | Watcher events → queue → collapse → reconcile. Reconciliation uses `status: 'missing'`, never hard-deletes. Consistent with existing entity lifecycle. |
| Coverage exclusion       | `framework-drivers/file-system/**`               | ChokidarWatcher depends on chokidar + Node fs. Same pattern as ElectronNotifier exclusion.                                                             |
