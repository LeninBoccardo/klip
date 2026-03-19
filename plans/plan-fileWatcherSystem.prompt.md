# Plan: File Watcher System (chokidar → SQLite Sync)

## Overview

The watcher monitors the user-defined root directory, detects file-system changes (add/change/unlink of `meta.json`, `creator.json`, `cut-data.json`, media files), parses them into domain entities, upserts/deletes in SQLite via the existing repositories, and pushes a `db-updated` event to the renderer.

Follows strict Clean Architecture: chokidar is isolated in `framework-drivers`, business rules live in a use-case, and everything is wired through interfaces.

## Answered Questions

1. **Root path source** — For now, defer "select root folder" UI. Accept the root path as a constructor argument when wiring the watcher in `index.ts`. A hardcoded dev default or `electron-store` persistence can be added later without changing the watcher internals.

2. **Initial full scan** — Yes. On startup, after the watcher is created, run a full directory walk (`SyncDirectory` use-case) to reconcile the DB with what's physically on disk. Chokidar's `ready` event naturally provides this — it fires `add` events for every existing file during its initial scan, then emits `ready`. The use-case treats initial-scan adds identically to runtime adds (idempotent upserts).

3. **Entity ID derivation** — Folder names ARE the IDs. `[Creator Name]` → `creator.id` (the raw folder name, not slugified). `[Video ID]` → `video.id`. `[Cut ID]` → `cut.id`. The path parser extracts these from the directory structure.

4. **Metadata JSON schemas** — Define TypeScript types for the JSON shapes in `src/main/domain/types/` (`MetaJson`, `CreatorJson`, `CutDataJson`). The file parser reads raw JSON and maps it + path-derived info into domain entities.

5. **Deletion cascading** — When a creator folder is deleted, delete the creator from SQLite; FK `ON DELETE CASCADE` handles videos/cuts automatically. The watcher only needs to detect the top-level deletion. For individual video/cut folder deletions, delete that specific entity.

6. **Debounce strategy** — Debounce per-directory: after the last event in a given directory path, wait 300ms before triggering the parse. This handles CapCut-style burst writes (multiple files written in rapid succession to the same folder). Chokidar's `awaitWriteFinish` option can also be enabled for large `.mp4` files still being written.

7. **ffprobe extraction** — Defer to a later task. The file parser will populate `duration`, `resolution`, `fileSize` as `null` when no `meta.json`/`cut-data.json` provides them. A future `ExtractMetadata` use-case will fill those gaps via ffprobe.

## Architecture Layers & New Files

### Domain layer (pure interfaces, no external deps)

| File                                    | Purpose                                                                                                     |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------- | ------------------------- |
| `src/main/domain/ports/IFileWatcher.ts` | Interface: `start(rootPath: string): void`, `stop(): void`, `onEvent(cb: (event: FileEvent) => void): void` |
| `src/main/domain/ports/INotifier.ts`    | Interface: `notify(channel: string, payload?: unknown): void` — abstracts `webContents.send`                |
| `src/main/domain/ports/index.ts`        | Barrel export                                                                                               |
| `src/main/domain/types/file-events.ts`  | `FileEvent` union type: `{ type: 'add'                                                                      | 'change' | 'unlink', path: string }` |
| `src/main/domain/types/json-schemas.ts` | `MetaJson`, `CreatorJson`, `CutDataJson` — shapes of the JSON files on disk                                 |

### Use-case layer (orchestration, depends only on interfaces)

| File                                   | Purpose                                                                                                                                                                                                                       |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main/use-cases/SyncFileSystem.ts` | Core use-case. Constructor receives `ICreatorRepository`, `IVideoRepository`, `ICutRepository`, `INotifier`. Exposes `handleFileEvent(event: FileEvent): void`. Contains all the path-parsing logic and entity-mapping rules. |

**`SyncFileSystem` logic rules:**

1. **Path classification** — Given an absolute path, determine what it represents by matching against the known folder structure:
   - `{root}/{creatorName}/creator.json` → creator upsert
   - `{root}/{creatorName}/downloads/{videoId}/meta.json` → video upsert
   - `{root}/{creatorName}/downloads/{videoId}/*.mp4` → video upsert (media file detected, fill `filePath`)
   - `{root}/{creatorName}/cuts/{cutId}/cut-data.json` → cut upsert
   - `{root}/{creatorName}/cuts/{cutId}/*.mp4` → cut upsert (media file detected, fill `filePath`)
   - `{root}/{creatorName}/downloads/{videoId}/thumbnail.*` → video upsert (`thumbnailPath`)
   - `{root}/{creatorName}/cuts/{cutId}/thumbnail.*` → cut upsert (`thumbnailPath`)
   - Anything else → ignored

2. **Implicit creator creation** — When a video or cut is detected, ensure the parent creator exists in the DB first. If not, upsert a minimal creator (`{ id: creatorName, name: creatorName, ... }`). If a `creator.json` exists, use its data instead.

3. **Unlink handling** — On `unlink` events:
   - If a `meta.json` or `cut-data.json` is deleted → delete that video/cut entity
   - If the entire creator folder disappears (detected via parent folder unlink or all children removed) → delete creator (FK cascade cleans children)
   - Media file unlink → update entity to clear `filePath`/`thumbnailPath`

4. **Notify after mutation** — After every successful upsert or delete, call `notifier.notify('db-updated')` so the renderer knows to refetch.

### Adapter layer

| File                                                        | Purpose                                                                                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------- | --------------------------- | ------- | ---------------------------------------------------------------------------- |
| `src/main/interface-adapters/file-parser/PathClassifier.ts` | Pure function: `classifyPath(rootPath: string, absolutePath: string): ClassifiedPath                                            | null`. Parses a path into `{ entityType: 'creator' | 'video' | 'cut', fileRole: 'metadata' | 'media' | 'thumbnail', creatorName, videoId?, cutId? }`. No I/O — just string parsing. |
| `src/main/interface-adapters/file-parser/JsonReader.ts`     | Reads and parses JSON files from disk. Wraps `fs.readFileSync` with error handling (returns `null` on missing/malformed files). |
| `src/main/interface-adapters/file-parser/EntityMapper.ts`   | Maps `ClassifiedPath` + parsed JSON + file stats into domain entities (`Creator`, `Video`, `Cut`). Pure mapping logic.          |

### Driver layer (framework-specific)

| File                                                        | Purpose                                                                                                                                                                                                  |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main/framework-drivers/file-system/ChokidarWatcher.ts` | Implements `IFileWatcher`. Wraps `chokidar.watch()` with the glob patterns for relevant files, debounce config (`awaitWriteFinish` for `.mp4`), and translates chokidar events into `FileEvent` objects. |
| `src/main/framework-drivers/electron/Notifier.ts`           | Implements `INotifier`. Calls `BrowserWindow.getAllWindows().forEach(w => w.webContents.send(channel, payload))`.                                                                                        |

### Wiring (in `src/main/index.ts`)

```text
app.whenReady() →
  1. createDb()                          (existing)
  2. Create Notifier instance
  3. Create SyncFileSystem use-case      (inject repos + notifier)
  4. Create ChokidarWatcher              (inject rootPath)
  5. Wire: watcher.onEvent(event => syncFileSystem.handleFileEvent(event))
  6. watcher.start()                     (triggers initial scan via chokidar 'add' events)
  7. createWindow()                      (existing)
```

## Chokidar Configuration

```typescript
chokidar.watch(rootPath, {
  persistent: true,
  ignoreInitial: false, // Fire 'add' for existing files on startup (full scan)
  awaitWriteFinish: {
    // Wait for large .mp4 files to finish writing
    stabilityThreshold: 500,
    pollInterval: 100
  },
  depth: 4, // root / creator / downloads|cuts / id / file
  ignored: [
    /(^|[\/\\])\../, // Ignore dotfiles
    /node_modules/,
    /\.DS_Store/
  ]
})
```

**Watched file patterns** (via chokidar glob or filtered in the event handler):

- `**/creator.json`
- `**/downloads/*/meta.json`
- `**/downloads/*/*.{mp4,mkv,webm}`
- `**/downloads/*/thumbnail.{jpg,jpeg,png,webp}`
- `**/cuts/*/cut-data.json`
- `**/cuts/*/*.{mp4,mkv,webm}`
- `**/cuts/*/thumbnail.{jpg,jpeg,png,webp}`

## Debounce Strategy

Use a per-directory debounce map inside `SyncFileSystem`:

```
Map<directoryPath, NodeJS.Timeout>
```

When an event arrives for `{root}/Creator/downloads/abc123/meta.json`:

1. Extract the directory: `{root}/Creator/downloads/abc123/`
2. Clear any existing timeout for that directory
3. Set a new 300ms timeout → on fire, parse the full directory and upsert

This coalesces rapid burst writes (e.g., CapCut exporting `cut.mp4` + `thumbnail.png` + `cut-data.json` in quick succession) into a single parse+upsert.

## Deletion Detection Strategy

Chokidar fires `unlink` for individual files and `unlinkDir` for directories:

| Event                                             | What it means                     | Action                                               |
| ------------------------------------------------- | --------------------------------- | ---------------------------------------------------- |
| `unlink` on `meta.json`                           | Video metadata removed            | Delete video entity                                  |
| `unlink` on `cut-data.json`                       | Cut metadata removed              | Delete cut entity                                    |
| `unlinkDir` on `{root}/{creator}/`                | Entire creator folder removed     | Delete creator (FK cascade)                          |
| `unlinkDir` on `{root}/{creator}/downloads/{id}/` | Video folder removed              | Delete video entity                                  |
| `unlinkDir` on `{root}/{creator}/cuts/{id}/`      | Cut folder removed                | Delete cut entity                                    |
| `unlink` on media/thumbnail file                  | Asset removed but folder persists | Update entity to null out `filePath`/`thumbnailPath` |

## Implementation Order

1. **Domain types** — `FileEvent`, `ClassifiedPath`, JSON schemas (`MetaJson`, `CreatorJson`, `CutDataJson`)
2. **Domain ports** — `IFileWatcher`, `INotifier` interfaces
3. **Adapter: PathClassifier** — Pure function, easily unit-testable
4. **Adapter: JsonReader** — Simple fs wrapper
5. **Adapter: EntityMapper** — Pure mapping, unit-testable
6. **Use-case: SyncFileSystem** — Wire path classification → JSON read → entity map → repo upsert/delete → notify
7. **Driver: ChokidarWatcher** — Implement `IFileWatcher` with chokidar
8. **Driver: Notifier** — Implement `INotifier` with Electron `webContents`
9. **Wiring in index.ts** — Connect all pieces
10. **Tests** — PathClassifier (unit), EntityMapper (unit), SyncFileSystem (unit, mocked repos), ChokidarWatcher (integration, temp directory)

## Testing Strategy

| Component         | Test type   | Approach                                                                                                                  |
| ----------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| `PathClassifier`  | Unit        | Pure function, pass various paths, assert classification                                                                  |
| `EntityMapper`    | Unit        | Pass classified paths + mock JSON, assert entity shape                                                                    |
| `SyncFileSystem`  | Unit        | Mock all repos + notifier via `vi.fn()`, fire events, assert calls                                                        |
| `JsonReader`      | Unit        | Use temp files via `fs.mkdtempSync`, verify parse results                                                                 |
| `ChokidarWatcher` | Integration | Create temp directory, start watcher, add/remove files, assert events emitted (may be flaky — keep in separate test file) |

All tests go under `tests/main/` mirroring the source structure.
