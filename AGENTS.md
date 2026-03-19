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
| **Adapters**  | `src/main/interface-adapters` | IPC Handlers and SQLite repository implementations.                      |
| **Drivers**   | `src/main/framework-drivers`  | SQLite config, Chokidar (File Watcher), and Electron Window logic.       |

The renderer accesses Electron APIs exclusively through `window.electron` (typed in `src/preload/index.d.ts`). Custom APIs are exposed via `window.api`—add new IPC handlers in `src/preload/index.ts` and register them in `src/main/index.ts` with `ipcMain`.

**Renderer Process:** Flattened for clarity. Features are grouped by domain (e.g., `/components/features/creators`).

## Data Management & Sync Pattern

To ensure high performance when filtering large amounts of media, strictly follow the Indexed Sync Pattern:

1. **Local Cache**: Use `better-sqlite3` in the Main process to store the state of the file system. All UI queries, filters, and sorts must hit this SQLite database, never the raw file system.

2. **File Watcher (Publisher)**: Run `chokidar` in the Main process to actively monitor the root directory for manual user changes (e.g., dropping a new export from CapCut).

3. **IPC Sync (Subscriber)**: When `chokidar` detects a change, the Main process parses the file, updates SQLite, and pushes an event (`webContents.send('db-updated')`) to the Renderer to trigger a UI refresh.

## External Binaries

- **yt-dlp**: Used via Node child processes to handle all external video downloads. Must be packaged with the app.

- **ffprobe**: Used to extract metadata (duration, resolution, file size) when new local files are detected by the file watcher.

## Clean Architecture Guidelines (Main Process)

The Main process must adhere to SOLID principles and isolate business logic from framework tools. Structure src/main/ accordingly:

- `domain/`: Core entities (Creator, Video, Cut), repository interfaces (e.g., `IVideoRepository`), and port interfaces (e.g., `IFileSystemReader` in `domain/ports/`). No external deps.

- `use-cases/`: Application rules (e.g., `ReconcileDirectory`, `ProcessFileNotifications`). Each use case receives its dependencies (repositories, ports) via constructor injection.

- `interface-adapters/`: Four subdirectories:
  - `controllers/` — IPC handlers (e.g., `ReconcileController.ts`)
  - `repositories/` — SQLite implementations (e.g., `SqliteCreatorRepository`)
  - `file-system/` — Port implementations (e.g., `NodeFileSystemReader`)
  - `queue/` — Notification queue implementation (`PQueueNotificationQueue`)

- `framework-drivers/`: Raw DB initialization (`database/database.ts`), timer abstractions (`timers/NodeDebouncer.ts`), Electron-specific adapters (`electron/ElectronNotifier.ts`), file-system watcher (`file-system/ChokidarWatcher.ts`), and window management.

## Path Aliases

Configured in both `electron.vite.config.ts` (Vite) and `tsconfig.json` (TS). Updated for the new architecture. Do not use relative deep-nesting (e.g., `../../../../`):

- `@/` → `src/renderer/`
- `@renderer/*` → `src/renderer/src/*`
- `@components/*` → `src/renderer/components/*`
- `@ui/*` → `src/renderer/components/ui/*`
- `@main/*` → `src/main/*`
- `@domain/*` → `src/main/domain/*`
- `@use-cases/*` → `src/main/use-cases/*`
- `@preload/*` → `src/preload/*`

Always use `@/components/ui/...` and `@/lib/utils` for renderer imports—this matches shadcn's alias config in `components.json`.

## Coding Conventions

1. **Dependency Inversion:** Use-cases must never import `better-sqlite3` or `chokidar` directly. They must use interfaces defined in `@domain/repositories`.
2. **IPC Isolation:** IPC Handlers in `interface-adapters/controllers` are the _only_ place allowed to use `ipcMain.handle`. They should call a Use Case and return the result.
3. **Slim Renderer:** The React layer should not know about file paths or SQL. It calls `window.api.getCreators()` and receives typed DTOs (Data Transfer Objects).
4. **Single Source of Truth:** The UI only queries the SQLite index. The `chokidar` driver in `framework-drivers` is responsible for keeping the SQLite index in sync with the root directory (default: `app.getPath('documents')/klip`).
5. **Dependency Injection Requirement**: Concrete infrastructure (DB, File Watcher, APIs) must never be instantiated inside Use Cases or Repositories. Always pass them as interfaces via constructors to ensure the core logic remains agnostic to the underlying technology.
6. **Entity Lifecycle (`EntityStatus`)**: All indexed entities use `status: 'active' | 'deleted' | 'missing'`. Reconciliation marks disappeared entities as `'missing'` (never hard-deletes). Only explicit user action sets `'deleted'`. Entities with `'deleted'` status are never touched by reconciliation.
7. **Tags JSON Serialization**: `Cut.tags` is `string[]` in the domain entity but stored as a JSON string in SQLite. Use `JSON.stringify()` on write and `JSON.parse()` on read. Tag-based queries use SQLite's `json_each()` function (see `SqliteCutRepository.findByTags()`).
8. **Sort-Column Allowlists**: Each SQLite repository defines a `Record<string, string>` map (camelCase UI key → snake_case DB column) to validate `sortBy` params. Unknown keys fall back to a default column. Never interpolate user-provided sort values directly into SQL.
9. **Database Migrations**: `framework-drivers/database/database.ts` uses a sequential fall-through `switch` on `PRAGMA user_version`. To add a migration: increment `CURRENT_SCHEMA_VERSION`, add a new `case N:` block (no `break`), and use `ALTER TABLE` statements. All migrations run in a single transaction.

## UI Components & Styling

- **shadcn/ui** (`radix-nova` style, non-RSC) generates components into `src/renderer/components/ui/`
- Add new shadcn components via: `npx shadcn@latest add <component>`
- Utility function `cn()` from `@/lib/utils` merges Tailwind classes—always use it for conditional class composition
- **Tailwind CSS v4** configured as a Vite plugin; theme tokens and CSS variables defined in `src/renderer/src/assets/main.css`
- Icons: `lucide-react`

## Testing

**Stack:** Vitest (single runner for both main + renderer), `@testing-library/react` + `jsdom` for React component tests, `@vitest/coverage-v8` for coverage.

**Config files:**

- `vitest.config.ts` — single root config with two inline projects (`main` environment: `node`, `renderer` environment: `jsdom`), path aliases matching `electron.vite.config.ts`, and global coverage thresholds.

**Folder structure:**

```
tests/
├── main/                               # Main-process tests (node environment)
│   ├── domain/types/                   # Pure-function unit tests (pagination helpers)
│   ├── framework-drivers/              # Database init / migration tests
│   ├── interface-adapters/repositories/# SQLite repository integration tests
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
- Use `createTestDb()` from `tests/main/helpers/createTestDb.ts` for all DB tests — it returns a fresh in-memory SQLite instance with all migrations applied. Always call `db.close()` in `afterEach`.
- Use factory functions (e.g. `makeCreator()`, `makeVideo()`, `makeCut()`) with `Partial<Entity>` overrides to build test data concisely.
- Use-case tests should mock repository interfaces (via `vi.fn()`), never instantiate real SQLite.
- Renderer tests use `@testing-library/react` with `render()` / `screen` — never test implementation details.

**Coverage thresholds:**

- Global: 80% (statements, branches, functions, lines).
- `src/main/use-cases/`: 90% target (not yet enforced per-project; will be added to `vitest.config.ts` when use-cases grow).
- Excluded from coverage: `src/main/index.ts`, barrel `index.ts` files, domain entity interfaces (`src/main/domain/entities/**`), repository interfaces (`src/main/domain/repositories/I*.ts`), port interfaces (`src/main/domain/ports/I*.ts`), pure type-only files (`entity-status.ts`, `file-event.ts`, `notification-events.ts`), IPC controllers (`src/main/interface-adapters/controllers/**`), file-system adapters (`src/main/interface-adapters/file-system/**`), Electron-dependent drivers (`src/main/framework-drivers/electron/**`), file-system drivers (`src/main/framework-drivers/file-system/**`), `src/renderer/components/ui/` (auto-generated shadcn), and `src/renderer/src/env.d.ts`.

## CI Pipeline

GitHub Actions (`.github/workflows/ci.yml`) runs on push/PR to `main`:

1. `npm run lint`
2. `npm run typecheck`
3. `npm run test:coverage`

Coverage reports are uploaded as artifacts (14-day retention).

## Key Commands

```bash
npm run dev          # Start Electron with HMR (renderer hot-reloads, main restarts)
npm run build:win    # Typecheck + build + package for Windows (NSIS installer)
npm run typecheck    # Run both node and web typechecks
npm run lint         # ESLint (flat config in eslint.config.mjs)
npm run format       # Prettier
npm run test         # Run all tests (main + renderer)
npm run test:watch   # Run tests in watch mode
npm run test:main    # Run only main-process tests
npm run test:renderer # Run only renderer tests
npm run test:coverage # Run all tests with coverage report
```

`npm run build` runs typecheck first—fix type errors before building. Platform builds (`build:mac`, `build:linux`) call `electron-vite build` directly without typecheck.

## Conventions

- Renderer components are `.tsx` files under `src/renderer/components/`; shared UI primitives live in `src/renderer/components/ui/`
- The renderer HTML (`src/renderer/index.html`) enforces a strict CSP—when adding external resources, update the `Content-Security-Policy` meta tag
- electron-builder config is in `electron-builder.yml` (not `package.json`)—app ID is `com.electron.app`, product name is `klip`
- Auto-update support via `electron-updater` is present in dependencies; publish URL is in `electron-builder.yml`
