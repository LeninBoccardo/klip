# Plan: MigrateRootFolder Use Case — Implementation Complete

## Summary

Implemented a self-contained, crash-safe use case that moves all creator folders from the current root to a new empty root directory, with inline rollback, progress reporting to the UI, and strict validation.

## Changes Made

### Shared Types

- **`src/shared/types/migrate-root.ts`** — New `MigrateRootProgress` and `MigrateRootResult` types
- **`src/shared/types/index.ts`** — Re-export new types

### IPC Layer

- **`src/shared/ipc-channels.ts`** — Added `MigrateRoot`, `SelectFolder`, `MigrateRootProgress` channels
- **`src/shared/ipc-contract.ts`** — Added contract entries for all 3 new channels
- **`src/main/domain/types/notification-events.ts`** — Added `migrate-root-progress` push event

### Domain Ports & Repositories

- **`src/main/domain/ports/IFileSystemWriter.ts`** — Added `moveDirectory()` (cross-drive safe) and `isDirectoryEmpty()`
- **`src/main/domain/repositories/IVideoRepository.ts`** — Added `updateFilePathPrefix()`
- **`src/main/domain/repositories/ICutRepository.ts`** — Added `updateFilePathPrefix()`

### Infrastructure Implementations

- **`src/main/interface-adapters/file-system/NodeFileSystemWriter.ts`** — Implemented `moveDirectory()` with `renameSync` fast path + `cpSync/rmSync` cross-device fallback, and `isDirectoryEmpty()`
- **`src/main/interface-adapters/repositories/SqliteVideoRepository.ts`** — Implemented `updateFilePathPrefix()` using Drizzle `sql` template with `replace()`
- **`src/main/interface-adapters/repositories/SqliteCutRepository.ts`** — Same
- **`src/main/interface-adapters/repositories/AuditedVideoRepository.ts`** — Delegated + audit log entry
- **`src/main/interface-adapters/repositories/AuditedCutRepository.ts`** — Same

### Use Case

- **`src/main/use-cases/IMigrateRootFolder.ts`** — Interface
- **`src/main/use-cases/MigrateRootFolder.ts`** — Full implementation with:
  - Validation: new root must be empty or non-existent, old root must exist, can't be same path
  - Suspend watcher + stop flow
  - Operations table saga log with per-folder progress tracking
  - Self-contained rollback on mid-move failure (moves folders back, no RecoverOperations coupling)
  - DB path prefix bulk update for videos and cuts
  - Settings rootPath update
  - Watcher restart on new root + reconciliation
  - Progress events pushed via INotifier

### Controller & Preload

- **`src/main/interface-adapters/controllers/SettingsController.ts`** — Added `migrate-root` and `select-folder` (Electron `dialog.showOpenDialog`) handlers
- **`src/preload/index.ts`** — Added `migrateRoot`, `selectFolder`, `onMigrateRootProgress`
- **`src/preload/index.d.ts`** — Type declarations for new API methods

### Wiring

- **`src/main/composition-root.ts`** — Added `IMigrateRootFolder` to `AppContainer.useCases`, instantiated `MigrateRootFolder`
- **`src/main/index.ts`** — Pass `migrateRootFolder` to `registerSettingsController`

### Tests (15 new tests)

- **`tests/main/use-cases/MigrateRootFolder.test.ts`** — 11 unit tests: validation errors, happy path, progress events, payload tracking, rollback on failure, DB failure handling, zero folders
- **`tests/main/interface-adapters/repositories/SqliteVideoRepository.test.ts`** — 2 integration tests for `updateFilePathPrefix`
- **`tests/main/interface-adapters/repositories/SqliteCutRepository.test.ts`** — 2 integration tests for `updateFilePathPrefix`

## Test Results

- 46 test files, 539 tests — all passing

## UI Implementation

### Zustand Store Extension

- **`src/renderer/hooks/use-app-store.ts`** — Added `blockingOperation` state + `startBlockingOperation`, `updateBlockingProgress`, `endBlockingOperation` actions

### Shared Component

- **`src/renderer/components/shared/BlockingOperationDialog.tsx`** — Non-dismissable shadcn `Dialog` driven by zustand `blockingOperation`. Shows spinner + title, description, `Progress` bar, phase label, current folder, `Badge` counter. Prevents escape/outside-click dismiss. Hidden close button via `[&>button]:hidden`.

### Feature Components

- **`src/renderer/components/features/settings/MigrateRootButton.tsx`** — Full flow:
  1. `Button` (outline) with `FolderSync` icon → opens native folder picker via `window.api.selectFolder()`
  2. Confirmation `AlertDialog` showing old/new paths
  3. On confirm → triggers mutation (blocking dialog auto-shows via hook)
  4. Result `Dialog` with success (CheckCircle) or error (XCircle) + Retry/Dismiss buttons
  5. Disabled when `blockingOperation` is active

### Hook

- **`src/renderer/hooks/use-migrate-root.ts`** — `useMutation<MigrateRootResult>` + `useEffect` subscribing to `onMigrateRootProgress`. Auto-manages blocking dialog lifecycle. Invalidates all query keys on success.

### Settings Page Integration

- **`src/renderer/src/routes/settings.tsx`** — `MigrateRootButton` below `RootPathDisplay` in Storage card. `ReconcileButton` disabled during blocking operations.
- **`src/renderer/components/features/settings/ReconcileButton.tsx`** — Added `disabled` prop.

### Root Layout

- **`src/renderer/src/routes/__root.tsx`** — `BlockingOperationDialog` mounted globally next to `Toaster`.

### Tests (16 new renderer tests)

- **`tests/renderer/hooks/use-app-store.test.ts`** — 5 new tests for blocking operation state
- **`tests/renderer/components/shared/BlockingOperationDialog.test.tsx`** — 6 tests: empty render, title, description, progress phases
- **`tests/renderer/components/features/settings/MigrateRootButton.test.tsx`** — 5 tests: renders, disabled state, folder picker, confirmation dialog, cancel
