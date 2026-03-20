```markdown
# Plan: Fresh Drizzle Schema + Entity ID Strategy + Operations Safety Net + Audit Trail

## Summary

Start Drizzle ORM from a clean slate (no legacy migration bridge), add `folderName` field + `slugify()` for Creators, introduce an `operations` table as a persistent saga log for crash-safe multi-step FS operations, an `audit_log` table for full mutation history, and a `settings` table for app configuration (starting with `rootPath`). Root folder migration uses the operations log for safe move-with-rollback. Watcher suspension via a guard pattern on `ProcessFileNotifications` prevents event interference during operations.

## Decisions Log

| Decision                        | Choice                                                                          | Rationale                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Schema strategy                 | Fresh from zero — no legacy migration bridge                                    | No production data yet; eliminates Phase 8 of old Drizzle plan                                                                      |
| Folder ID strategy              | Slugified folder name as stable PK + explicit `folderName` field on Creator     | Self-documenting code, future-proof if ID ever diverges                                                                             |
| Folder rename on discovery      | Yes — rename user-created folders to slug pattern                               | Long-term consistency; crash-safe via operations table                                                                              |
| Audit log placement             | Repository-level via decorator pattern                                          | Catches ALL mutations automatically; clean separation                                                                               |
| Audit retention                 | Keep all indefinitely                                                           | Prune use case deferred to future                                                                                                   |
| Move vs copy for root migration | Move with rollback via operations table                                         | Fast (same-partition), recoverable                                                                                                  |
| Watcher during operations       | Guard pattern — `suspend()`/`resume()` on `ProcessFileNotifications`            | Single boolean check per event, negligible overhead; dropped events are fine because full reconciliation runs after every operation |
| `INotificationGate` interface   | Not needed — `suspend()`/`resume()` live directly on `ProcessFileNotifications` | YAGNI; class is already exposed as concrete type in container                                                                       |
| Transaction scope               | Keep using raw `better-sqlite3` `db.transaction()` (unchanged)                  | Same underlying connection; simpler                                                                                                 |

---

## New Database Tables (6 total in fresh schema)

### Existing (updated)

#### `creators`

- **New column:** `folder_name TEXT NOT NULL UNIQUE` — actual directory name on disk (slugified)
- `id` remains `TEXT PRIMARY KEY` (= `folder_name` for disk-discovered creators)
- `name` is display name (from `creator.json` or original user input)

#### `videos` — unchanged columns

#### `cuts` — unchanged columns

### New

#### `settings`

| Column       | Type               | Purpose                          |
| ------------ | ------------------ | -------------------------------- |
| `key`        | `TEXT PRIMARY KEY` | Setting key (e.g., `'rootPath'`) |
| `value`      | `TEXT NOT NULL`    | Setting value                    |
| `updated_at` | `TEXT NOT NULL`    | ISO timestamp                    |

#### `operations`

| Column         | Type               | Purpose                                                                      |
| -------------- | ------------------ | ---------------------------------------------------------------------------- |
| `id`           | `TEXT PRIMARY KEY` | UUID                                                                         |
| `type`         | `TEXT NOT NULL`    | `'rename_folder'`, `'migrate_root'`, `'bulk_import'`                         |
| `status`       | `TEXT NOT NULL`    | `'pending'` → `'in_progress'` → `'completed'` / `'failed'` / `'rolled_back'` |
| `payload`      | `TEXT NOT NULL`    | JSON — operation-specific data (old/new paths, progress checkpoints)         |
| `error`        | `TEXT`             | Error message if failed                                                      |
| `started_at`   | `TEXT`             | ISO timestamp                                                                |
| `completed_at` | `TEXT`             | ISO timestamp                                                                |
| `created_at`   | `TEXT NOT NULL`    | ISO timestamp                                                                |

#### `audit_log`

| Column        | Type                                | Purpose                                                      |
| ------------- | ----------------------------------- | ------------------------------------------------------------ |
| `id`          | `INTEGER PRIMARY KEY AUTOINCREMENT` | Sequential for ordering                                      |
| `entity_type` | `TEXT NOT NULL`                     | `'creator'`, `'video'`, `'cut'`, `'settings'`, `'operation'` |
| `entity_id`   | `TEXT NOT NULL`                     | PK of the affected entity                                    |
| `action`      | `TEXT NOT NULL`                     | `'created'`, `'updated'`, `'status_changed'`, `'deleted'`    |
| `changes`     | `TEXT`                              | JSON diff: `{ field: { old, new } }` — null for `'created'`  |
| `created_at`  | `TEXT NOT NULL`                     | ISO timestamp                                                |

---

## Domain Layer Changes

### New/Updated Entity Interfaces (`domain/entities/`)

- **`Creator`** — add `folderName: string`
- **`Operation`** _(new)_ — mirrors operations table
- **`AuditEntry`** _(new)_ — mirrors audit_log table
- **`AppSetting`** _(new)_ — mirrors settings table

### New/Updated Repository Interfaces (`domain/repositories/`)

- **`ICreatorRepository`** — add `findByFolderName(folderName: string): Creator | null`
- **`IOperationRepository`** _(new)_ — `create`, `updateStatus`, `updatePayload`, `findById`, `findByStatus`
- **`IAuditLogRepository`** _(new)_ — `append(entry)`, `findByEntity(type, id)`, `findRecent(limit)`
- **`ISettingsRepository`** _(new)_ — `get(key)`, `set(key, value)`, `getAll()`

### New/Updated Port Interfaces (`domain/ports/`)

- **`IFileSystemWriter`** — add `renameDirectory(oldPath, newPath): void`
- **`IFileWatcher`** — add `restart(newRootPath: string): void`

### New Domain Utility (`domain/types/`)

- **`slugify.ts`** — pure function: NFD normalize, strip diacritics, lowercase, spaces→hyphens, strip non-alphanumeric, collapse hyphens, trim hyphens

---

## Use Case Changes

### Updated

- **`ReconcileDirectory`** — use `creator.folderName` for all path construction; key dedup map by `folderName`; inject `IFileSystemWriter`; on new creator discovery: slugify → create operation → rename folder → upsert entity
- **`DownloadVideo`** — `ensureCreator()` slugifies `creatorName` for `id`/`folderName`, keeps original as `name`
- **`ProcessFileNotifications`** — add `suspend()` / `resume()` methods (boolean guard on `handleEvent`)

### New

- **`RecoverOperations`** — runs at startup; scans for `'in_progress'` operations; applies type-specific recovery (folder rename: check paths and complete/rollback; root migration: check `movedSoFar` and complete/rollback)
- **`MigrateRootFolder`** — orchestrates root path change: validate → create operation → move folders (with progress) → update DB paths → update settings → mark completed

---

## Adapter/Driver Changes

### Repositories (Drizzle rewrite)

All 3 existing `Sqlite*Repository` classes rewritten with Drizzle query builder. Plus 3 new ones:

- `SqliteOperationRepository`
- `SqliteAuditLogRepository`
- `SqliteSettingsRepository`

### Audited Decorators

3 new decorator classes wrapping the core entity repositories:

- `AuditedCreatorRepository` wraps `ICreatorRepository`
- `AuditedVideoRepository` wraps `IVideoRepository`
- `AuditedCutRepository` wraps `ICutRepository`

Each delegates reads directly, intercepts mutations (`upsert`, `updateStatus`, `delete`) to write audit entries via `IAuditLogRepository`.

### File System

- `NodeFileSystemWriter` — implement `renameDirectory()` (wraps `fs.renameSync`)
- `ChokidarWatcher` — implement `restart(newRootPath)` (stop → update path → start)

### Database

- `database.ts` — rewrite: create raw `better-sqlite3` instance, wrap with `drizzle()`, apply Drizzle migrations. Export `DatabaseInstance { raw, db }`.
- `schema.ts` _(new)_ — all 6 tables defined with Drizzle's `sqliteTable` API
- `SqliteTransactionScope` — unchanged (keeps using raw driver)

---

## Watcher Suspension Design

### Guard on `ProcessFileNotifications`
```

suspend() → this.suspended = true; this.debouncer.cancel()
resume() → this.suspended = false; this.queue.drain() (discard stale events)
handleEvent() → if (this.suspended) return // one-line guard at top

```

### Flow A — Folder rename (same root)
1. `processNotifications.suspend()`
2. Create operation record (`pending` → `in_progress`)
3. Rename folder on disk
4. Update DB entity
5. Mark operation `completed`
6. `processNotifications.resume()`
7. Trigger targeted reconciliation

### Flow B — Root migration (watcher restart)
1. `processNotifications.suspend()`
2. `fileWatcher.stop()`
3. Create operation record with `movedSoFar` tracking
4. Move files, updating operation progress per folder
5. Update all DB paths + settings
6. Mark operation `completed`
7. `fileWatcher.restart(newRootPath)`
8. `processNotifications.resume()`
9. Trigger full reconciliation

### Startup (natural safety)
1. `RecoverOperations` runs (watcher not started yet — zero events)
2. Full reconciliation
3. Watcher starts → events flow normally

---

## Composition Root & App Lifecycle Changes

### `composition-root.ts`
- `initializeDatabase()` returns `{ raw, db }` — pass `db` to repos, `raw` to transaction scope
- Wire new repos: settings, operations, audit log
- Wrap entity repos with audited decorators: `creatorRepo = new AuditedCreatorRepository(sqliteCreatorRepo, auditLogRepo)`
- Inject `IFileSystemWriter` into `ReconcileDirectory`
- Expose `processNotifications` with `suspend()`/`resume()` access

### `index.ts`
- Read `rootPath` from `ISettingsRepository` — if null, use default `Documents/klip` and persist
- Run `RecoverOperations` before initial reconciliation
- Register new IPC controller for settings (`get-root-path`, `change-root-folder`)

---

## Implementation Order

Execute sequentially. Each step must pass `npm run typecheck && npm run test` before proceeding.

### Phase 1 — Drizzle Foundation
1. Install `drizzle-orm` + `drizzle-kit`
2. Create `drizzle.config.ts`
3. Create `schema.ts` with all 6 tables (creators with `folder_name`, videos, cuts, settings, operations, audit_log)
4. Delete manual migration system in `database.ts`, rewrite with Drizzle
5. Run `drizzle-kit generate` for initial migration
6. Add npm scripts (`db:generate`, `db:migrate`, `db:studio`)
7. Rewrite `createTestDb.ts` for Drizzle
8. Update `database.test.ts`

### Phase 2 — Domain Layer Updates
9. Add `folderName` to `Creator` entity
10. Create `Operation`, `AuditEntry`, `AppSetting` entity interfaces
11. Create `IOperationRepository`, `IAuditLogRepository`, `ISettingsRepository`
12. Add `findByFolderName()` to `ICreatorRepository`
13. Add `renameDirectory()` to `IFileSystemWriter`
14. Add `restart()` to `IFileWatcher`
15. Create `slugify()` in `domain/types/`
16. Update entity and type barrel exports

### Phase 3 — Repository Rewrites (Drizzle)
17. Rewrite `SqliteCreatorRepository` with Drizzle (includes `findByFolderName`)
18. Rewrite `SqliteVideoRepository` with Drizzle
19. Rewrite `SqliteCutRepository` with Drizzle
20. Implement `SqliteSettingsRepository`
21. Implement `SqliteOperationRepository`
22. Implement `SqliteAuditLogRepository`
23. Create audited decorator repositories
24. Update all repository tests
25. Update `SqliteTransactionScope.test.ts`

### Phase 4 — Adapter/Driver Updates
26. Implement `NodeFileSystemWriter.renameDirectory()`
27. Implement `ChokidarWatcher.restart()`
28. Add `suspend()`/`resume()` to `ProcessFileNotifications`

### Phase 5 — Use Case Fixes & New Use Cases
29. Fix `ReconcileDirectory` — use `folderName`, fix dedup, inject `IFileSystemWriter`, slug + rename + operation on discovery
30. Fix `DownloadVideo` — slugify in `ensureCreator()`
31. Implement `RecoverOperations` use case
32. Implement `MigrateRootFolder` use case
33. Update/create use case tests

### Phase 6 — Wiring & Integration
34. Update `composition-root.ts` — wire everything
35. Update `index.ts` — settings-based rootPath, startup recovery, new IPC controllers
36. Create `SettingsController` IPC handler
37. Update `AGENTS.md` documentation

### Phase 7 — Cleanup
38. Delete dead code (raw SQL helpers, manual migration functions, old type mappings)
39. Update `vitest.config.ts` coverage exclusions (add schema.ts, migrations/, new interface files)
40. Full test suite + typecheck + lint pass

---

## File Change Summary

### New Files
| File | Layer |
|---|---|
| `drizzle.config.ts` | Config |
| `src/main/framework-drivers/database/schema.ts` | Drivers |
| `src/main/framework-drivers/database/migrations/` | Drivers (generated) |
| `src/main/domain/entities/Operation.ts` | Domain |
| `src/main/domain/entities/AuditEntry.ts` | Domain |
| `src/main/domain/entities/AppSetting.ts` | Domain |
| `src/main/domain/repositories/IOperationRepository.ts` | Domain |
| `src/main/domain/repositories/IAuditLogRepository.ts` | Domain |
| `src/main/domain/repositories/ISettingsRepository.ts` | Domain |
| `src/main/domain/types/slugify.ts` | Domain |
| `src/main/interface-adapters/repositories/SqliteSettingsRepository.ts` | Adapters |
| `src/main/interface-adapters/repositories/SqliteOperationRepository.ts` | Adapters |
| `src/main/interface-adapters/repositories/SqliteAuditLogRepository.ts` | Adapters |
| `src/main/interface-adapters/repositories/AuditedCreatorRepository.ts` | Adapters |
| `src/main/interface-adapters/repositories/AuditedVideoRepository.ts` | Adapters |
| `src/main/interface-adapters/repositories/AuditedCutRepository.ts` | Adapters |
| `src/main/use-cases/RecoverOperations.ts` | Use Cases |
| `src/main/use-cases/IRecoverOperations.ts` | Use Cases |
| `src/main/use-cases/MigrateRootFolder.ts` | Use Cases |
| `src/main/use-cases/IMigrateRootFolder.ts` | Use Cases |
| `src/main/interface-adapters/controllers/SettingsController.ts` | Adapters |
| `tests/main/domain/types/slugify.test.ts` | Tests |
| `tests/main/interface-adapters/repositories/SqliteSettingsRepository.test.ts` | Tests |
| `tests/main/interface-adapters/repositories/SqliteOperationRepository.test.ts` | Tests |
| `tests/main/interface-adapters/repositories/SqliteAuditLogRepository.test.ts` | Tests |
| `tests/main/use-cases/RecoverOperations.test.ts` | Tests |
| `tests/main/use-cases/MigrateRootFolder.test.ts` | Tests |

### Modified Files
| File | Change |
|---|---|
| `package.json` | Add `drizzle-orm`, `drizzle-kit`, new scripts |
| `src/main/domain/entities/Creator.ts` | Add `folderName` field |
| `src/main/domain/entities/index.ts` | Export new entities |
| `src/main/domain/repositories/ICreatorRepository.ts` | Add `findByFolderName()` |
| `src/main/domain/repositories/index.ts` | Export new repos |
| `src/main/domain/ports/IFileSystemWriter.ts` | Add `renameDirectory()` |
| `src/main/domain/ports/IFileWatcher.ts` | Add `restart()` |
| `src/main/domain/ports/index.ts` | Update exports |
| `src/main/domain/types/index.ts` | Export `slugify` |
| `src/main/framework-drivers/database/database.ts` | Rewrite with Drizzle |
| `src/main/framework-drivers/database/index.ts` | Update exports |
| `src/main/interface-adapters/repositories/SqliteCreatorRepository.ts` | Drizzle rewrite |
| `src/main/interface-adapters/repositories/SqliteVideoRepository.ts` | Drizzle rewrite |
| `src/main/interface-adapters/repositories/SqliteCutRepository.ts` | Drizzle rewrite |
| `src/main/interface-adapters/repositories/index.ts` | Export new repos |
| `src/main/interface-adapters/file-system/NodeFileSystemWriter.ts` | Add `renameDirectory()` |
| `src/main/framework-drivers/file-system/ChokidarWatcher.ts` | Add `restart()` |
| `src/main/use-cases/ReconcileDirectory.ts` | Fix bugs, use `folderName`, slug+rename |
| `src/main/use-cases/DownloadVideo.ts` | Fix `ensureCreator()` |
| `src/main/use-cases/ProcessFileNotifications.ts` | Add `suspend()`/`resume()` |
| `src/main/composition-root.ts` | Wire all new deps |
| `src/main/index.ts` | Settings-based rootPath, startup recovery |
| `tests/main/helpers/createTestDb.ts` | Drizzle rewrite |
| `tests/main/framework-drivers/database.test.ts` | Update for Drizzle |
| `tests/main/framework-drivers/SqliteTransactionScope.test.ts` | Update DB type |
| `tests/main/interface-adapters/repositories/*.test.ts` | Update for Drizzle DB type |
| `tests/main/use-cases/ReconcileDirectory.test.ts` | Update for `folderName` |
| `tests/main/use-cases/DownloadVideo.test.ts` | Update for slugify |
| `tests/main/use-cases/ProcessFileNotifications.test.ts` | Add suspend/resume tests |
| `vitest.config.ts` | Add coverage exclusions |
| `AGENTS.md` | Update docs |

### Files NOT Touched (boundary respect)
- `src/main/domain/ports/ITransactionScope.ts` — unchanged
- `src/main/framework-drivers/database/SqliteTransactionScope.ts` — unchanged (uses raw driver)
- `src/main/interface-adapters/controllers/ReconcileController.ts` — unchanged
- `src/main/interface-adapters/controllers/DownloadController.ts` — unchanged
- `src/main/interface-adapters/queue/` — unchanged
- `src/main/framework-drivers/electron/` — unchanged
- `src/main/framework-drivers/timers/` — unchanged
- `src/main/framework-drivers/yt-dlp/` — unchanged
- `src/main/framework-drivers/ffprobe/` — unchanged
- `src/preload/` — unchanged
- `src/renderer/` — unchanged
```
