# Plan: Next Steps (Prioritized Roadmap)

## Context

As of 2026-04-15, the Klip backend is mature: Clean Architecture layers are complete, 390 tests pass across 25 files, Drizzle ORM with 6 tables, 7 use cases, 19 IPC endpoints, typed IPC contract, audited repositories, file watcher, notification queue, and media enrichment are all implemented and wired.

The remaining work falls into 4 steps ordered by priority. Each step lists the key files an agent should read for context (in addition to `AGENTS.md` which is always required).

---

## Step 1: Build the Renderer UI

**Priority:** CRITICAL - the app has no usable interface yet.

**Goal:** Build the full React UI shell and feature screens so Klip is actually usable as a desktop app.

**Current state:** The renderer is scaffolding only: TanStack Router with empty routes (index, about), a theme provider, and 44 shadcn/ui primitives installed. Zero feature components exist.

**What to build (in order):**

1. App Shell / Layout - Sidebar navigation (creators, library, downloads, settings), resizable panels
2. Creators List - Grid/list view, search/filter by status, click-to-drill-in
3. Creator Detail with Videos and Cuts - Thumbnail grid, metadata cards, tabs for downloads vs cuts
4. Download Panel - URL input, fetchVideoInfo preview, downloadVideo with real-time progress
5. Settings Page - Root path display/change, manual reconciliation trigger
6. Soft-delete / Restore UX - Status badges, context menu actions (delete/restore)

**Installed renderer dependencies already available:**

- TanStack Router (file-based routing configured)
- TanStack React Table (data tables)
- TanStack React Virtual (virtualized lists)
- zustand (state management)
- react-hook-form + zod (forms/validation)
- react-resizable-panels (layout panels)
- shadcn/ui 44 components (radix-nova style)
- lucide-react (icons)
- sonner (toast notifications)
- cmdk (command palette)
- date-fns (date formatting)
- react-hotkeys-hook (keyboard shortcuts)

### Key Files for Context

**IPC contract (what the renderer can call):**

- `src/preload/index.d.ts` - KlipAPI interface with all available methods
- `src/shared/ipc-contract.ts` - Full typed IPC contract
- `src/shared/ipc-channels.ts` - All channel name constants

**DTOs (data shapes the renderer receives):**

- `src/shared/dtos/CreatorDto.ts`
- `src/shared/dtos/VideoDto.ts`
- `src/shared/dtos/CutDto.ts`
- `src/shared/dtos/AuditEntryDto.ts`
- `src/shared/dtos/OperationDto.ts`

**Query/pagination types:**

- `src/shared/types/pagination.ts` - PaginationParams, PaginatedResult, VideoQueryParams, CutQueryParams
- `src/shared/types/download.ts` - DownloadStatus, DownloadRequest, DownloadProgress, VideoInfo
- `src/shared/types/entity-status.ts` - EntityStatus union
- `src/shared/types/probe-status.ts` - ProbeStatus union
- `src/shared/types/use-case-results.ts` - ReconcileResult, DownloadVideoResult

**Renderer scaffolding (current state):**

- `src/renderer/index.html` - Entry HTML with CSP
- `src/renderer/src/routes/main.tsx` - TanStack Router bootstrap
- `src/renderer/src/routes/__root.tsx` - Root layout (currently minimal nav links)
- `src/renderer/src/routes/index.tsx` - Home route (placeholder)
- `src/renderer/components/theme-provider.tsx` - Dark/light theme
- `src/renderer/src/assets/main.css` - Tailwind v4 theme tokens and CSS variables
- `src/renderer/lib/utils.ts` - cn() utility for Tailwind class merging

**Config:**

- `electron.vite.config.ts` - Renderer aliases and plugins (TanStack Router plugin, React, Tailwind)
- `components.json` - shadcn config (aliases, style, icon library)
- `tsconfig.web.json` - Renderer TypeScript config

---

## Step 2: YouTube Channel Metadata

**Priority:** MEDIUM - enrichment feature, not blocking core workflow.

**Goal:** Extract YouTube channel metadata from yt-dlp calls (already returned but discarded), store on Creator/Video entities, and expose a standalone FetchChannelInfo use case for on-demand refresh.

**Prerequisite:** None (backend-only, can run in parallel with UI work).

**Existing plan file:** `plans/plan-youtubeChannelMetadata.prompt.md` (15 tasks, fully detailed).

**Summary of changes:**

1. New shared type: ChannelInfo (channelId, channelName, channelUrl, subscriberCount, avatarUrl)
2. Extend VideoInfo and DownloadResult with channel metadata fields plus viewCount
3. Extend Creator entity with youtubeChannelId, youtubeChannelUrl, subscriberCount, avatarUrl
4. Extend Video entity with viewCount
5. Schema migration (new columns on creators and videos tables)
6. Update pushSchema() for test DBs
7. New repo method: findByYoutubeChannelId on ICreatorRepository
8. Update YtDlpDownloader.fetchInfo() and buildResult() to extract channel fields
9. New port method: fetchChannelInfo(channelUrl) on IVideoDownloader
10. New use case: FetchChannelInfo (match by channelId or slugified name)
11. Enrich Creator during DownloadVideo.performDownload()
12. New IPC endpoint: fetch-channel-info
13. Wire in composition root
14. Update ReconcileDirectory for new Creator fields
15. Tests for everything above

### Key Files for Context

**Entities to extend:**

- `src/main/domain/entities/Creator.ts`
- `src/main/domain/entities/Video.ts`

**DTOs to extend:**

- `src/shared/dtos/CreatorDto.ts`
- `src/shared/dtos/VideoDto.ts`

**Types to extend:**

- `src/shared/types/download.ts` - VideoInfo and DownloadResult

**Schema and DB:**

- `src/main/framework-drivers/database/schema.ts`
- `src/main/framework-drivers/database/database.ts` - pushSchema() function

**Repositories to update:**

- `src/main/domain/repositories/ICreatorRepository.ts`
- `src/main/interface-adapters/repositories/SqliteCreatorRepository.ts`
- `src/main/interface-adapters/repositories/SqliteVideoRepository.ts`
- `src/main/interface-adapters/repositories/AuditedCreatorRepository.ts`

**Port and driver to extend:**

- `src/main/domain/ports/IVideoDownloader.ts`
- `src/main/framework-drivers/yt-dlp/YtDlpDownloader.ts`

**Use cases to update or create:**

- `src/main/use-cases/DownloadVideo.ts` - ensureCreator() enrichment
- `src/main/use-cases/ReconcileDirectory.ts` - new Creator fields

**IPC layer:**

- `src/shared/ipc-channels.ts`
- `src/shared/ipc-contract.ts`
- `src/main/interface-adapters/controllers/DownloadController.ts`
- `src/preload/index.ts`
- `src/preload/index.d.ts`

**Wiring:**

- `src/main/composition-root.ts`

**Domain utilities:**

- `src/main/domain/types/slugify.ts` - used for channel-to-creator matching

**Tests to update:**

- `tests/main/use-cases/DownloadVideo.test.ts`
- `tests/main/use-cases/ReconcileDirectory.test.ts`
- `tests/main/interface-adapters/repositories/SqliteCreatorRepository.test.ts`
- `tests/main/interface-adapters/repositories/SqliteVideoRepository.test.ts`

**Full plan reference:**

- `plans/plan-youtubeChannelMetadata.prompt.md`

---

## Step 3: MigrateRootFolder Use Case

**Priority:** LOW - needed for Settings page but not for MVP.

**Goal:** Implement a use case that safely moves all creator folders from the current root to a new root directory, tracking progress via the operations table for crash recovery.

**Prerequisite:** Step 1 Settings Page (provides the UI trigger). Infrastructure already exists: operations table, IOperationRepository, suspend/resume on ProcessFileNotifications, IFileWatcher.restart(), RecoverOperations.

**Design (from plan-drizzleFreshSchema):**

1. processNotifications.suspend()
2. fileWatcher.stop()
3. Create operation record (type: migrate_root) with movedSoFar tracking in payload
4. Move folders one by one, updating operation payload progress after each
5. Update all DB file paths (videos.filePath, cuts.filePath, videos.thumbnailPath, cuts.thumbnailPath)
6. Update settings rootPath
7. Mark operation completed
8. fileWatcher.restart(newRootPath)
9. processNotifications.resume()
10. Trigger full reconciliation

### Key Files for Context

**Domain entities and ports:**

- `src/main/domain/entities/Operation.ts` - Operation entity with OperationStatus and OperationType
- `src/main/domain/repositories/IOperationRepository.ts` - create, updateStatus, updatePayload, findByStatus
- `src/main/domain/repositories/ISettingsRepository.ts` - get, set, getAll
- `src/main/domain/ports/IFileWatcher.ts` - start(), stop(), restart(newRootPath), onEvent()
- `src/main/domain/ports/IFileSystemWriter.ts` - ensureDirectory, writeFile, renameDirectory
- `src/main/domain/ports/IFileSystemReader.ts` - readDirectory, fileExists, readJsonFile
- `src/main/domain/ports/IPathResolver.ts` - join, basename, dirname

**Existing use cases to interact with:**

- `src/main/use-cases/ProcessFileNotifications.ts` - suspend() and resume() methods
- `src/main/use-cases/RecoverOperations.ts` - handles stale migrate_root operations at startup
- `src/main/use-cases/IReconcileDirectory.ts` - execute(rootPath) for post-migration scan

**Repository implementations:**

- `src/main/interface-adapters/repositories/SqliteOperationRepository.ts`
- `src/main/interface-adapters/repositories/SqliteSettingsRepository.ts`
- `src/main/interface-adapters/repositories/SqliteVideoRepository.ts` - need to update filePaths
- `src/main/interface-adapters/repositories/SqliteCutRepository.ts` - need to update filePaths

**Wiring and startup:**

- `src/main/composition-root.ts` - AppContainer interface and createAppContainer
- `src/main/index.ts` - startup sequence, rootPath resolution, controller registration

**IPC layer (new endpoint needed):**

- `src/shared/ipc-channels.ts`
- `src/shared/ipc-contract.ts`
- `src/main/interface-adapters/controllers/SettingsController.ts`
- `src/preload/index.ts`
- `src/preload/index.d.ts`

**Existing tests for reference:**

- `tests/main/use-cases/RecoverOperations.test.ts`
- `tests/main/use-cases/ProcessFileNotifications.test.ts`
- `tests/main/interface-adapters/repositories/SqliteOperationRepository.test.ts`

**Original plan reference:**

- `plans/plan-drizzleFreshSchema-entityIds-operations.prompt.md` - Phase 5 step 32, Watcher Suspension Design section

---

## Step 4: Granular Path Processing (Performance Optimization)

**Priority:** LOW - performance optimization, only needed when measured.

**Goal:** Replace the full-reconciliation fallback in ProcessFileNotifications with per-creator targeted reconciliation for small change sets (below the RECONCILE_THRESHOLD of 50 collapsed events).

**Current state:** ProcessFileNotifications.processGranular() already exists and works. It classifies events via classifyPath(), groups by creator name, and calls reconcile.executeForCreator() per affected creator. The full-reconciliation path is the fallback for large bursts.

The remaining work is verifying edge cases and potentially optimizing the path classification to handle more granular entity-level operations (individual video/cut upserts) instead of always reconciling the entire creator subtree.

**What might need to change:**

1. EntityMapper - pure function that maps classified paths plus JSON metadata into domain entities for direct upsert (bypassing full creator reconciliation)
2. JsonReader - reads meta.json, creator.json, cut-data.json from disk
3. Direct upsert path in processGranular for individual file add/change events
4. Only fall back to executeForCreator for directory-level events or unlinks

### Key Files for Context

**Current implementation (already working for per-creator granular):**

- `src/main/use-cases/ProcessFileNotifications.ts` - processGranular() method
- `src/main/domain/types/path-classification.ts` - classifyPath() function and PathClassification type
- `src/main/domain/types/collapse-events.ts` - collapseEvents() pure function
- `src/main/domain/types/file-event.ts` - FileEvent and FileEventType

**Reconciliation (target for granular bypass):**

- `src/main/use-cases/ReconcileDirectory.ts` - execute() and executeForCreator()
- `src/main/use-cases/IReconcileDirectory.ts` - interface with both methods

**Domain types for JSON schemas:**

- `src/main/domain/types/index.ts` - barrel exports

**File system ports:**

- `src/main/domain/ports/IFileSystemReader.ts` - readJsonFile for meta.json parsing
- `src/main/domain/ports/IPathResolver.ts` - path manipulation

**Repository interfaces (for direct upserts):**

- `src/main/domain/repositories/ICreatorRepository.ts`
- `src/main/domain/repositories/IVideoRepository.ts`
- `src/main/domain/repositories/ICutRepository.ts`

**Tests:**

- `tests/main/use-cases/ProcessFileNotifications.test.ts`
- `tests/main/domain/types/collapse-events.test.ts`

**Original design references:**

- `plans/plan-notificationQueue.prompt.md` - threshold design and granular stub
- `plans/plan-fileWatcherSystem.prompt.md` - PathClassifier, EntityMapper, JsonReader design
