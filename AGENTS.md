# AGENTS.md

## Project Specification & Domain

Klip is a local, offline-first desktop asset manager designed to organize downloaded source videos (e.g., from YouTube) and manually created video cuts (e.g., exported from CapCut).

**Core Paradigm:** The SQLite index is the authoritative source of truth for application state, while the OS file system acts as the underlying storage layer. The UI interacts exclusively with the indexed data, and file system changes are ingested through controlled synchronization processes.

**Target Folder Structure:**

```text
[User Defined Root]/
└── [Creator Name]/
    ├── creator.json (Optional fallback metadata)
    ├── downloads/
    │   └── [Video ID]/
    │       ├── video.mp4
    │       ├── thumbnail.jpg
    │       └── meta.json (Original URL, duration, date)
    └── cuts/
        └── [Cut ID]/
            ├── cut.mp4
            ├── thumbnail.png
            └── cut-data.json (Title, tags, original timestamps)
```

## Architecture (Clean Architecture + Electron Best Practices)

Klip is an Electron desktop app built with **electron-vite**, **React 19**, and **TypeScript**. The codebase follows a strict layered architecture in the **Main Process** to separate business logic from the infrastructure:

| Layer         | Folder                        | Responsibility                                                           |
| ------------- | ----------------------------- | ------------------------------------------------------------------------ |
| **Domain**    | `src/main/domain`             | Enterprise rules, Entities, and Repository Interfaces. No external deps. |
| **Use Cases** | `src/main/use-cases`          | Orchestrates data flow between Entities and Repositories.                |
| **Adapters**  | `src/main/interface-adapters` | IPC Handlers and Drizzle ORM repository implementations.                 |
| **Drivers**   | `src/main/framework-drivers`  | Drizzle ORM config, Chokidar (File Watcher), and Electron Window logic.  |

The renderer accesses Electron APIs exclusively through `window.electron` (typed in `src/preload/index.d.ts`). Custom APIs are exposed via `window.api`—add new IPC handlers in `src/preload/index.ts` and register them in `src/main/index.ts` with `ipcMain`.

**Renderer Process:** Flattened for clarity. Features are grouped by domain (e.g., `/components/features/creators`).

## Data Management & Sync Pattern

To ensure high performance when filtering large amounts of media, strictly follow the Indexed Sync Pattern:

1. **Local Cache**: Use `better-sqlite3` (via **Drizzle ORM**) in the Main process to store the state of the file system. All UI queries, filters, and sorts must hit this SQLite database, never the raw file system.

2. **File Watcher (Publisher)**: Run `chokidar` in the Main process to actively monitor the root directory for manual user changes (e.g., dropping a new export from CapCut).

3. **IPC Sync (Subscriber)**: When `chokidar` detects a change, the Main process parses the file, updates SQLite, and pushes an event (`webContents.send('db-updated')`) to the Renderer to trigger a UI refresh.

## External Binaries

- **yt-dlp**: Used via Node child processes to handle all external video downloads. Must be packaged with the app.

- **ffprobe**: Used to extract metadata (duration, resolution, file size) when new local files are detected by the file watcher.

## Clean Architecture Guidelines (Main Process)

The Main process must adhere to SOLID principles and isolate business logic from framework tools. Structure src/main/ accordingly:

- `domain/`: Core entities (Creator, Video, Cut, Operation, AuditEntry, AppSetting), repository interfaces (e.g., `IVideoRepository`, `IOperationRepository`, `IAuditLogRepository`, `ISettingsRepository`), and port interfaces (e.g., `IFileSystemReader`, `IFileSystemWriter`, `IPathResolver`, `ITransactionScope` in `domain/ports/`). No external deps.

- `use-cases/`: Application rules (e.g., `ReconcileDirectory`, `ProcessFileNotifications`, `DownloadVideo`, `FetchVideoInfo`, `ProbeMediaFile`, `RecoverOperations`). Each use case receives its dependencies (repositories, ports) via constructor injection. Use-case interfaces (e.g., `IReconcileDirectory`) live alongside their implementations.

- `interface-adapters/`: Four subdirectories:
  - `controllers/` — IPC handlers (e.g., `ReconcileController.ts`, `DownloadController.ts`, `CreatorController.ts`, `VideoController.ts`, `CutController.ts`, `SettingsController.ts`)
  - `repositories/` — Drizzle ORM implementations (e.g., `SqliteCreatorRepository`) and audited decorators (e.g., `AuditedCreatorRepository`)
  - `file-system/` — Port implementations (e.g., `NodeFileSystemReader`, `NodeFileSystemWriter`, `NodePathResolver`)
  - `queue/` — Queue implementations (`PQueueNotificationQueue`, `PQueueDownloadQueue`)

- `framework-drivers/`: Drizzle DB initialization (`database/database.ts`), Drizzle schema definition (`database/schema.ts`), Drizzle migrations (`database/migrations/`), transaction scope (`database/SqliteTransactionScope.ts`), timer abstractions (`timers/NodeDebouncer.ts`), Electron-specific adapters (`electron/ElectronNotifier.ts`, `electron/ElectronBinaryResolver.ts`), file-system watcher (`file-system/ChokidarWatcher.ts`), yt-dlp driver (`yt-dlp/YtDlpDownloader.ts`), ffprobe driver (`ffprobe/FfprobeMediaProbe.ts`), and window management.

- `composition-root.ts` (`src/main/composition-root.ts`): Creates and wires all concrete dependencies into an `AppContainer`. The `index.ts` entry point calls `createAppContainer()` and uses the returned container — no module-level mutable singletons.

## Database Layer (Drizzle ORM)

The data layer uses **Drizzle ORM** on top of `better-sqlite3`. Raw SQL is never used in repositories — all queries go through Drizzle's type-safe query builder.

### Schema

Defined in `src/main/framework-drivers/database/schema.ts` using Drizzle's `sqliteTable` API. **6 tables** total:

| Table        | Purpose                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------- |
| `creators`   | Indexed creator profiles. Has `folder_name` (unique, slugified) + display `name`.           |
| `videos`     | Indexed source videos. FK → `creators(id)` with `ON DELETE CASCADE`.                        |
| `cuts`       | Indexed video cuts. FK → `creators(id)` CASCADE, FK → `videos(id)` SET NULL.                |
| `settings`   | App configuration key-value store (e.g., `rootPath`).                                       |
| `operations` | Persistent saga log for crash-safe multi-step FS operations (rename, migrate, bulk import). |
| `audit_log`  | Immutable mutation history for all entity changes.                                          |

**Column naming convention:** Drizzle schema keys are camelCase (matching domain entities), while SQL column names use `snake_case` via `text('snake_case')`. Drizzle handles the mapping automatically — no manual `mapRowToEntity` functions needed.

### Database Initialization (`database.ts`)

`initializeDatabase(dbPath)` returns a `DatabaseInstance { raw, db }`:

- `raw` — the `better-sqlite3` `Database` handle (used for transactions via `SqliteTransactionScope` and for shutdown via `raw.close()`).
- `db` — the Drizzle ORM instance (`BetterSQLite3Database<typeof schema>`, aliased as `AppDatabase`), used by all repositories.

**Pragmas:** WAL mode and foreign keys are always enabled.

**Migrations:**

- **Production / file-based DBs:** Uses Drizzle's `migrate()` function reading from `src/main/framework-drivers/database/migrations/` (generated by `drizzle-kit generate`).
- **In-memory test DBs (`:memory:`):** Schema is pushed directly via raw `CREATE TABLE` / `CREATE INDEX` SQL in a `pushSchema()` helper inside `database.ts`, avoiding the need for migration files on disk.

### Drizzle Kit Configuration

`drizzle.config.ts` at project root:

```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/framework-drivers/database/schema.ts',
  out: './src/main/framework-drivers/database/migrations'
})
```

### Database Migrations Workflow

To add a new migration:

1. Modify `src/main/framework-drivers/database/schema.ts` (add/alter columns, new tables).
2. Run `npm run db:generate` — Drizzle Kit diffs the schema and generates a new SQL migration in `src/main/framework-drivers/database/migrations/`.
3. Update the `pushSchema()` function in `database.ts` to match the new schema (for in-memory test DBs).
4. Run `npm run test` to verify.

> **No manual `PRAGMA user_version` switch.** The old hand-rolled migration system has been fully replaced by Drizzle Kit's migration workflow.

### Repository Pattern with Drizzle

All `Sqlite*Repository` classes accept the Drizzle `AppDatabase` instance via constructor injection. Queries use Drizzle's composable query builder:

```ts
// Example: SqliteCreatorRepository.findAllActive()
this.db.select().from(creators).where(eq(creators.status, 'active')).orderBy(asc(creators.name))
```

**Sort-column allowlists** use `Record<string, SQLiteColumn>` maps (camelCase key → Drizzle column reference) instead of raw string maps. Unknown keys fall back to a default column.

**Upserts** use `this.db.insert(table).values({…}).onConflictDoUpdate({…})`.

### Audited Repository Decorators

Three decorator classes wrap the core entity repositories to automatically write audit trail entries:

- `AuditedCreatorRepository` wraps `ICreatorRepository`
- `AuditedVideoRepository` wraps `IVideoRepository`
- `AuditedCutRepository` wraps `ICutRepository`

Each delegates reads directly to the inner repository and intercepts mutations (`upsert`, `updateStatus`, `delete`) to append entries to the `audit_log` table via `IAuditLogRepository`. Decorators are wired in `composition-root.ts` — external consumers (use-cases, controllers) always receive the audited wrapper.

### Transaction Scope

`SqliteTransactionScope` uses the **raw** `better-sqlite3` `db.transaction()` — not Drizzle's `.transaction()`. Since both share the same underlying connection, transactions apply to all Drizzle queries within the callback. The `ITransactionScope` port interface in `domain/ports/` is unchanged.

## Domain Entities

All entity interfaces live in `src/main/domain/entities/`. They are pure TypeScript interfaces with no external dependencies.

| Entity       | File            | Key Fields                                                                                                          |
| ------------ | --------------- | ------------------------------------------------------------------------------------------------------------------- |
| `Creator`    | `Creator.ts`    | `id`, `folderName` (slugified, unique), `name` (display), `profileImagePath`, `status`, `deletedAt`, timestamps     |
| `Video`      | `Video.ts`      | `id`, `creatorId`, `title`, `url`, `duration`, `resolution`, `fileSize`, `filePath`, `thumbnailPath`, `status`, …   |
| `Cut`        | `Cut.ts`        | `id`, `creatorId`, `videoId?`, `title`, `tags: string[]`, `startTimestamp`, `endTimestamp`, `filePath`, `status`, … |
| `Operation`  | `Operation.ts`  | `id`, `type`, `status`, `payload` (JSON), `error`, `startedAt`, `completedAt`, `createdAt`                          |
| `AuditEntry` | `AuditEntry.ts` | `id`, `entityType`, `entityId`, `action`, `changes` (JSON diff), `createdAt`                                        |
| `AppSetting` | `AppSetting.ts` | `key`, `value`, `updatedAt`                                                                                         |

### Entity Lifecycle (`EntityStatus`)

All indexed entities (Creator, Video, Cut) use `status: 'active' | 'deleted' | 'missing'`. Reconciliation marks disappeared entities as `'missing'` (never hard-deletes). Only explicit user action sets `'deleted'`. Entities with `'deleted'` status are never touched by reconciliation.

### Operations Lifecycle (`OperationStatus`)

Operations use `status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled_back'`. Operation types include `'rename_folder'`, `'migrate_root'`, `'bulk_import'`. The `payload` field stores JSON with operation-specific data (old/new paths, progress checkpoints).

### Creator `folderName` & Slugification

- `Creator.folderName` is the actual directory name on disk (slugified).
- `Creator.id` equals `folderName` for disk-discovered creators.
- `Creator.name` is the display name (from `creator.json` or original user input).
- `slugify()` in `src/main/domain/types/slugify.ts` is a pure function: NFD normalize → strip diacritics → lowercase → spaces to hyphens → strip non-alphanumeric → collapse hyphens → trim hyphens.

## Repository Interfaces

All repository interfaces live in `src/main/domain/repositories/`:

| Interface              | Key Methods                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| `ICreatorRepository`   | `findById`, `findByFolderName`, `findAllActive`, `findPaginated`, `upsert`, `updateStatus`, … |
| `IVideoRepository`     | `findById`, `findByCreatorId`, `findPaginated`, `upsert`, `updateStatus`, …                   |
| `ICutRepository`       | `findById`, `findByCreatorId`, `findByTags`, `findPaginated`, `upsert`, `updateStatus`, …     |
| `ISettingsRepository`  | `get(key)`, `set(key, value)`, `getAll()`                                                     |
| `IOperationRepository` | `create`, `updateStatus`, `updatePayload`, `findById`, `findByStatus`                         |
| `IAuditLogRepository`  | `append(entry)`, `findByEntity(type, id)`, `findRecent(limit)`                                |

## Port Interfaces

All port interfaces live in `src/main/domain/ports/`:

| Port                 | Purpose                                                       |
| -------------------- | ------------------------------------------------------------- |
| `IFileSystemReader`  | Read directories, check file existence, read JSON files       |
| `IFileSystemWriter`  | Write files, create directories, `renameDirectory()`          |
| `IPathResolver`      | Path joining, extraction — no direct `path` module imports    |
| `ITransactionScope`  | Wrap operations in a SQLite transaction                       |
| `INotifier`          | Push events to renderer (`webContents.send`)                  |
| `IDebouncer`         | Debounce file watcher notifications                           |
| `INotificationQueue` | Queue file change events for batch processing                 |
| `IDownloadQueue`     | Concurrency-limited queue for yt-dlp downloads                |
| `IBinaryResolver`    | Resolve paths to bundled binaries (yt-dlp, ffprobe)           |
| `IVideoDownloader`   | Download videos and fetch info via yt-dlp                     |
| `IMediaProbe`        | Extract media metadata via ffprobe                            |
| `IFileWatcher`       | Start/stop/restart file system watching, `onEvent()` callback |

## Watcher Suspension (Guard Pattern)

`ProcessFileNotifications` has `suspend()` / `resume()` methods to prevent file watcher events from interfering during multi-step operations (folder renames, root migrations):

```
suspend() → this.suspended = true; this.debouncer.cancel()
resume()  → this.suspended = false; this.queue.drain() (discard stale events)
handleEvent() → if (this.suspended) return  // one-line guard at top
```

**Flow for folder rename (same root):**

1. `processNotifications.suspend()`
2. Create operation record (`pending` → `in_progress`)
3. Rename folder on disk
4. Update DB entity
5. Mark operation `completed`
6. `processNotifications.resume()`
7. Trigger targeted reconciliation

**Flow for root migration (watcher restart):**

1. `processNotifications.suspend()`
2. `fileWatcher.stop()`
3. Create operation record with `movedSoFar` tracking
4. Move files, updating operation progress per folder
5. Update all DB paths + settings
6. Mark operation `completed`
7. `fileWatcher.restart(newRootPath)`
8. `processNotifications.resume()`
9. Trigger full reconciliation

**Startup (natural safety):**

1. `RecoverOperations` runs (watcher not started yet — zero events)
2. Full reconciliation
3. Watcher starts → events flow normally

## Composition Root & App Container

`src/main/composition-root.ts` wires all dependencies into an `AppContainer`:

```ts
interface AppContainer {
  database: DatabaseInstance
  repositories: {
    creator: ICreatorRepository // AuditedCreatorRepository
    video: IVideoRepository // AuditedVideoRepository
    cut: ICutRepository // AuditedCutRepository
    settings: ISettingsRepository
    operation: IOperationRepository
    auditLog: IAuditLogRepository
  }
  ports: {
    fsReader
    fsWriter
    pathResolver
    transactionScope
    notifier
    debouncer
    binaryResolver
    videoDownloader
    mediaProbe
    downloadQueue
  }
  useCases: {
    reconcile: IReconcileDirectory
    processNotifications: ProcessFileNotifications // exposed concretely for suspend/resume
    fetchVideoInfo: IFetchVideoInfo
    downloadVideo: IDownloadVideo
    probeMediaFile: IProbeMediaFile
    recoverOperations: IRecoverOperations
  }
  services: { fileWatcher: IFileWatcher }
  shutdown(): void // stops watcher, cancels debouncer, clears queue, closes DB
}
```

**Wiring pattern:**

1. `initializeDatabase(dbPath)` runs in `index.ts` → `{ raw, db }`
2. `createAppContainer({ database, defaultRootPath, isDev })` resolves the effective `rootPath` from the `settings` table (persisting the default on first launch) before constructing any path-dependent dependency.
3. Raw Drizzle repositories: `new SqliteCreatorRepository(db)`, etc.
4. Audited decorators: `new AuditedCreatorRepository(sqliteCreatorRepo, auditLogRepo, transactionScope)`
5. Transaction scope: `new SqliteTransactionScope(raw)` (uses raw driver)
6. Use cases receive interfaces only
7. `AppConfig { database, defaultRootPath, isDev }` passed in from `index.ts`

## Path Aliases

Configured in both `electron.vite.config.ts` (Vite), `tsconfig.json` (TS), and `vitest.config.ts` (tests). Do not use relative deep-nesting (e.g., `../../../../`):

- `@/` → `src/renderer/`
- `@renderer/*` → `src/renderer/src/*`
- `@components/*` → `src/renderer/components/*`
- `@ui/*` → `src/renderer/components/ui/*`
- `@main/*` → `src/main/*`
- `@domain/*` → `src/main/domain/*`
- `@use-cases/*` → `src/main/use-cases/*`
- `@shared/*` → `src/shared/*`
- `@preload/*` → `src/preload/*`

Always use `@/components/ui/...` and `@/lib/utils` for renderer imports—this matches shadcn's alias config in `components.json`.

## Shared Type System (`src/shared/`)

The `src/shared/` directory contains types, DTOs, and constants that cross the IPC boundary between the main process, preload bridge, and renderer. It has **zero framework dependencies** — only pure TypeScript.

### Structure

```
src/shared/
├── index.ts              # Barrel re-export
├── ipc-channels.ts       # IpcChannels constant object (single source of truth for channel names)
├── ipc-contract.ts       # IpcContract interface mapping channels → { params, result }
├── types/                # Types that cross the IPC boundary
│   ├── entity-status.ts  # EntityStatus
│   ├── pagination.ts     # PaginationParams, PaginatedResult, SortDirection
│   ├── download.ts       # DownloadStatus, DownloadRequest, DownloadProgress, DownloadResult, VideoInfo
│   ├── media-probe.ts    # MediaProbeResult
│   ├── use-case-results.ts # ReconcileResult, DownloadVideoResult
│   └── index.ts
└── dtos/                 # Renderer-facing Data Transfer Objects
    ├── CreatorDto.ts
    ├── VideoDto.ts
    ├── CutDto.ts
    └── index.ts
```

### Canonical Type Ownership

**Shared is the canonical source** for all IPC-crossing types. Domain type files (`src/main/domain/types/`) re-export from `@shared/types` rather than defining types inline. This eliminates duplication while keeping the renderer decoupled from main-process internals.

### IPC Channel Constants

All IPC channel names are defined once in `src/shared/ipc-channels.ts` as a `const` object (`IpcChannels`). Controllers use `IpcChannels.Reconcile` instead of string literals `'reconcile'`. The preload bridge uses the same constants.

### IPC Contract

`src/shared/ipc-contract.ts` defines `IpcContract` — a typed map of every channel to `{ params: [...args]; result: ReturnType }`. Helper types `IpcResult<C>` and `IpcParams<C>` extract the result/params for a given channel.

### Adding a New IPC Endpoint

1. Add the channel name to `IpcChannels` in `src/shared/ipc-channels.ts`
2. Add the channel entry to `IpcContract` in `src/shared/ipc-contract.ts`
3. If new types are needed, add them to `src/shared/types/`
4. Create the IPC handler in `src/main/interface-adapters/controllers/`
5. Add the preload method in `src/preload/index.ts` using the channel constant
6. Add the type declaration in `src/preload/index.d.ts` importing from `@shared/types`

## Coding Conventions

1. **Dependency Inversion:** Use-cases must never import `better-sqlite3`, `drizzle-orm`, `chokidar`, or Node built-in modules (e.g., `path`, `fs`) directly. They must use interfaces defined in `@domain/ports` and `@domain/repositories`. Path manipulation goes through `IPathResolver`, file access through `IFileSystemReader` / `IFileSystemWriter`, and transactions through `ITransactionScope`.
2. **Domain Purity:** `src/main/domain/` must have **zero** imports of `drizzle-orm`, `better-sqlite3`, or any external dependency. Entities, repository interfaces, port interfaces, and domain types are pure TypeScript.
3. **IPC Isolation:** IPC Handlers in `interface-adapters/controllers` are the _only_ place allowed to use `ipcMain.handle`. They should call a Use Case and return the result.
4. **Slim Renderer:** The React layer should not know about file paths or SQL. It calls `window.api.getCreators()` and receives typed DTOs (Data Transfer Objects).
5. **Single Source of Truth:** The UI only queries the SQLite index. The `chokidar` driver in `framework-drivers` is responsible for keeping the SQLite index in sync with the root directory (default: `app.getPath('documents')/klip`).
6. **Dependency Injection Requirement**: Concrete infrastructure (DB, File Watcher, APIs) must never be instantiated inside Use Cases or Repositories. Always pass them as interfaces via constructors to ensure the core logic remains agnostic to the underlying technology.
7. **Entity Lifecycle (`EntityStatus`)**: All indexed entities use `status: 'active' | 'deleted' | 'missing'`. Reconciliation marks disappeared entities as `'missing'` (never hard-deletes). Only explicit user action sets `'deleted'`. Entities with `'deleted'` status are never touched by reconciliation.
8. **Tags JSON Serialization**: `Cut.tags` and `Video.tags` are `string[]` in the domain entities but stored as JSON `TEXT` columns in SQLite. On **write**, use `JSON.stringify(entity.tags)` when passing to Drizzle's `.values()` / `.set()`. On **read**, post-process with `.map(r => ({ ...r, tags: JSON.parse(r.tags as string) }))` (or a `parseTags` helper that defaults to `[]` on malformed input). Tag-based queries use SQLite's `json_each()` via Drizzle's `sql` template — see `SqliteCutRepository.findByTags()`.
9. **Sort-Column Allowlists**: Each Drizzle-based repository defines a `Record<string, SQLiteColumn>` map (camelCase UI key → Drizzle column reference) to validate `sortBy` params. Unknown keys fall back to a default column. Never interpolate user-provided sort values directly into SQL.
10. **Audited Mutations**: All mutations on `creators`, `videos`, and `cuts` go through audited repository decorators, which automatically write to the `audit_log` table. Direct `Sqlite*Repository` instances are only used internally by the decorator — external consumers always use the audited wrapper.
11. **Operations Safety Net**: Multi-step file system operations (folder renames, root migrations) must be tracked in the `operations` table as a persistent saga log. This enables crash recovery at startup via `RecoverOperations`.
12. **Creator ID = Folder Name**: `Creator.id` is set to the slugified `folderName` for disk-discovered creators. The `slugify()` function in `domain/types/slugify.ts` deterministically converts display names to filesystem-safe identifiers.
13. **Database Migrations**: Use Drizzle Kit's migration workflow. Modify `schema.ts`, run `npm run db:generate`, update `pushSchema()` for tests. Never use manual `PRAGMA user_version` migration switches.

## UI Components & Styling

### Component Construction Hierarchy

When building any UI element, follow this strict priority order:

1. **Use an existing shadcn/ui component** — Check `src/renderer/components/ui/` first. If a component exists (e.g., `Card`, `Item`, `Field`, `InputGroup`, `Badge`, `Button`, `Tabs`, `Table`, `ScrollArea`, `ContextMenu`, `Combobox`, `Empty`, etc.), use it.
2. **Compose shadcn components + Tailwind** — If no single shadcn component fits, compose multiple shadcn components and add Tailwind utility classes for layout (e.g., `CreatorCard` = `Card` + `Avatar` + `Badge` + Tailwind for spacing).
3. **Pure Tailwind component** — Only if no shadcn component exists for the pattern. Must still use `cn()` from `@/lib/utils` for conditional classes.

**Never** use raw HTML elements with inline styles or arbitrary CSS classes when a shadcn component exists for that purpose.

### App Shell & Viewport Foundation

The Electron viewport is locked with a CSS-level flex chain in `main.css`:

```
html(h-full overflow-hidden)
  → body(h-full overflow-hidden bg-background)
    → #root(flex h-full flex-col overflow-hidden)
      → SidebarProvider(min-h-svh flex)
        → Sidebar (fixed/collapsible)
        → SidebarInset(flex h-full flex-col overflow-hidden)
          → header(shrink-0 h-12 border-b) — SidebarTrigger + Breadcrumb
          → div(flex-1 overflow-hidden) — <Outlet /> renders here
            → **PageContainer**(h-full → ScrollArea → constrained content)
```

**Critical:** `overflow-hidden` propagates down the chain. Only `PageContainer`'s `ScrollArea` scrolls. This prevents double scrollbars.

### Shared Layout Components

All shared components live in `src/renderer/components/shared/` and are re-exported from `shared/index.ts`.

| Component            | Built With                    | Purpose                                                                |
| -------------------- | ----------------------------- | ---------------------------------------------------------------------- |
| `PageContainer`      | shadcn `ScrollArea` + tw      | Wraps every route. Provides scroll, max-width (6xl), padding, spacing. |
| `PageHeader`         | Tailwind                      | Title + optional description + action slot. Used at top of every page. |
| `ResponsiveGrid`     | CVA + Tailwind                | Single grid with `columns` variants: `media`, `wide`, `two`.           |
| `StatusBadge`        | shadcn `Badge`                | Entity status indicator (active/deleted/missing).                      |
| `MediaCard`          | shadcn `Card` + `AspectRatio` | Video/cut thumbnail card with duration overlay and metadata.           |
| `PaginationControls` | shadcn `Pagination`           | Paginated navigation with ellipsis and prev/next.                      |
| `EntityContextMenu`  | shadcn `ContextMenu`          | Right-click delete/restore for any entity.                             |

### Feature Components

Grouped by domain under `src/renderer/components/features/`:

- `features/layout/` — `AppSidebar` (shadcn `Sidebar` + `SidebarMenu`)
- `features/creators/` — `CreatorCard` (shadcn `Card` + `Avatar`), `CreatorHeader` (shadcn `Item`), `CreatorFilters` (shadcn `InputGroup` + `Select`)
- `features/downloads/` — `UrlInput` (shadcn `InputGroup` + `Field` + `FieldError`), `VideoInfoPreview` (shadcn `Card` + `Item`), `CreatorSelector` (shadcn `Field`), `DownloadProgressCard` (shadcn `Item` + `Progress` + `Badge`), `ActiveDownloadsList` (shadcn `ItemGroup` + `Empty`)
- `features/settings/` — `RootPathDisplay` (shadcn `Field` + `InputGroup`), `ReconcileButton` (shadcn `Button` + `Card` + `ResponsiveGrid`)

### shadcn Component Mapping Reference

When you need a UI pattern, use this mapping:

| Pattern                    | shadcn Component                                         |
| -------------------------- | -------------------------------------------------------- |
| Flex row with icon + text  | `Item` + `ItemMedia(variant="icon")` + `ItemContent`     |
| List of items              | `ItemGroup` + `Item`                                     |
| Form field + label + error | `Field` + `FieldLabel` + `FieldError`                    |
| Input with icon prefix     | `InputGroup` + `InputGroupAddon` + `InputGroupInput`     |
| Thumbnail with ratio       | `AspectRatio` inside `Card`                              |
| Empty state                | `Empty` + `EmptyHeader` + `EmptyMedia` + `EmptyTitle`    |
| Scrollable region          | `ScrollArea`                                             |
| Dropdown selection         | `Select` + `SelectTrigger` + `SelectContent`             |
| Data table                 | `Table` + `TableHeader` + `TableBody` + `TableRow`       |
| Grouped settings sections  | `Card` + `CardHeader` + `CardTitle` + `CardContent`      |
| Breadcrumb navigation      | `Breadcrumb` + `BreadcrumbList` + `BreadcrumbItem`       |
| Right-click actions        | `ContextMenu` + `ContextMenuTrigger` + `ContextMenuItem` |

### CSS & Theme

- **Tailwind CSS v4** configured as a Vite plugin
- Theme tokens (oklch colors, radius) defined in `src/renderer/src/assets/main.css`
- Light and dark themes via CSS variables (`.dark` class toggled by `ThemeProvider`)
- `cn()` from `@/lib/utils` for conditional class composition — always use it
- Icons: `lucide-react`
- Add new shadcn components via: `npx shadcn@latest add <component>`

## Testing

**Stack:** Vitest (single runner for both main + renderer), `@testing-library/react` + `jsdom` for React component tests, `@vitest/coverage-v8` for coverage.

**Config files:**

- `vitest.config.ts` — single root config with two inline projects (`main` environment: `node`, `renderer` environment: `jsdom`), path aliases matching `electron.vite.config.ts`, and global coverage thresholds.

**Folder structure:**

```
tests/
├── main/                               # Main-process tests (node environment)
│   ├── domain/types/                   # Pure-function unit tests (pagination, slugify)
│   ├── framework-drivers/              # Database init / migration / transaction tests
│   ├── interface-adapters/
│   │   ├── repositories/               # Drizzle repository integration tests
│   │   └── queue/                      # Queue tests
│   ├── use-cases/                      # Use-case tests (mock repos via interfaces)
│   └── helpers/
│       └── createTestDb.ts             # In-memory DB factory (calls initializeDatabase(':memory:'))
├── renderer/                           # Renderer tests (jsdom environment)
│   └── components/
└── setup/
    ├── main.setup.ts
    └── renderer.setup.ts
```

**Writing tests:**

- Place test files next to their mirror in `tests/`, e.g. `src/main/interface-adapters/repositories/SqliteCreatorRepository.ts` → `tests/main/interface-adapters/repositories/SqliteCreatorRepository.test.ts`.
- Use `createTestDb()` from `tests/main/helpers/createTestDb.ts` for all DB tests — it returns `{ raw, db }`: a fresh in-memory Drizzle + `better-sqlite3` instance with all tables created via `pushSchema()`. Always call `raw.close()` in `afterEach`.
- Use factory functions (e.g. `makeCreator()`, `makeVideo()`, `makeCut()`) with `Partial<Entity>` overrides to build test data concisely. Factories may be defined locally per test file (current convention — keeps each test's defaults visible inline) or centralized in `tests/main/helpers/` when shared by ≥3 test files; pick whichever keeps the call site readable.
- Use-case tests should mock repository interfaces (via `vi.fn()`), never instantiate real SQLite or Drizzle.
- Renderer tests use `@testing-library/react` with `render()` / `screen` — never test implementation details.
- Repository tests instantiate the real `Sqlite*Repository` with the Drizzle `db` from `createTestDb()`.

**Coverage thresholds:**

- Global: 75% lines / 70% (statements, branches) / 65% functions. Realistic floor for the current renderer surface — raise as feature containers and the remaining renderer hooks grow tests. Functions trails because several read-query and event-listener hooks have no direct tests (call sites cover them indirectly).
- `src/main/use-cases/`: 90% lines / 80% branches, enforced per-glob via `coverage.thresholds['src/main/use-cases/**/*.ts']` in `vitest.config.ts`.
- Excluded from coverage: `src/main/index.ts`, `src/main/composition-root.ts`, barrel `index.ts` files, domain entity interfaces (`src/main/domain/entities/**`), repository interfaces (`src/main/domain/repositories/I*.ts`), port interfaces (`src/main/domain/ports/I*.ts`), pure type-only files (`entity-status.ts`, `file-event.ts`, `notification-events.ts`, `download.ts`, `media-probe.ts`), use-case interfaces (`src/main/use-cases/I*.ts`), IPC controllers (`src/main/interface-adapters/controllers/**`), file-system adapters (`src/main/interface-adapters/file-system/**`), Electron-dependent drivers (`src/main/framework-drivers/electron/**`), file-system drivers (`src/main/framework-drivers/file-system/**`), yt-dlp drivers (`src/main/framework-drivers/yt-dlp/**`), ffprobe drivers (`src/main/framework-drivers/ffprobe/**`), Drizzle schema (`src/main/framework-drivers/database/schema.ts`), Drizzle migrations (`src/main/framework-drivers/database/migrations/**`), `src/shared/**` (DTOs, IPC contract, type-only re-exports), `src/renderer/components/ui/` (auto-generated shadcn), and `src/renderer/src/env.d.ts`.

## CI Pipeline

GitHub Actions (`.github/workflows/ci.yml`) runs on push/PR to `main`:

1. `npm run lint`
2. `npm run typecheck`
3. `npm run test:coverage`

Coverage reports are uploaded as artifacts (14-day retention).

## Key Commands

```bash
npm run dev           # Start Electron with HMR (renderer hot-reloads, main restarts)
npm run build:win     # Typecheck + build + package for Windows (NSIS installer)
npm run typecheck     # Run both node and web typechecks
npm run lint          # ESLint (flat config in eslint.config.mjs)
npm run format        # Prettier
npm run test          # Run all tests (main + renderer)
npm run test:watch    # Run tests in watch mode
npm run test:main     # Run only main-process tests
npm run test:renderer # Run only renderer tests
npm run test:coverage # Run all tests with coverage report
npm run db:generate   # Drizzle Kit — generate migration SQL from schema changes
npm run db:migrate    # Drizzle Kit — apply pending migrations
npm run db:studio     # Drizzle Kit — open visual DB browser
```

`npm run build` runs typecheck first—fix type errors before building. Platform builds (`build:mac`, `build:linux`) call `electron-vite build` directly without typecheck.

## Conventions

- Renderer components are `.tsx` files under `src/renderer/components/`; shared UI primitives live in `src/renderer/components/ui/`
- The renderer HTML (`src/renderer/index.html`) enforces a strict CSP—when adding external resources, update the `Content-Security-Policy` meta tag
- electron-builder config is in `electron-builder.yml` (not `package.json`)—app ID is `com.electron.app`, product name is `klip`
- Auto-update support via `electron-updater` is present in dependencies; publish URL is in `electron-builder.yml`
