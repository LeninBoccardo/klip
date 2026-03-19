# Plan: File Watch Notification Queue (Double-Buffer + Adaptive Flush)

## Status: IMPLEMENTED ✅

## Overview

Added a notification queue system between the (future) chokidar file watcher and the SQLite database. Raw file-system events are buffered, debounced, deduplicated/collapsed per path, then flushed via either a full `ReconcileDirectory` sweep (≥ 50 collapsed events) or a granular path (< 50, stubbed for now — falls back to reconciliation until `PathClassifier` + `EntityMapper` exist).

Uses a **double-buffer model**: `drain()` atomically swaps the buffer so events arriving mid-flush are captured for the next cycle. **p-queue** (concurrency: 1) serializes drain operations to guarantee atomicity.

## What Was Built

### Domain Layer

| File                                           | Purpose                                                                                                                                        |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main/domain/types/file-event.ts`          | `FileEventType` and `FileEvent` — internal abstraction over chokidar events                                                                    |
| `src/main/domain/types/collapse-events.ts`     | Pure `collapseEvents()` function — deduplicates and collapses event sequences per path using a 16-entry rule lookup table                      |
| `src/main/domain/types/notification-events.ts` | `NotificationEventMap` typed event map + `NotificationChannel` union — contract for renderer notifications                                     |
| `src/main/domain/ports/INotificationQueue.ts`  | Queue port: `enqueue()`, `drain(): Promise<FileEvent[]>`, `size()`                                                                             |
| `src/main/domain/ports/IDebouncer.ts`          | Timer port: `schedule(cb, ms)`, `cancel()`                                                                                                     |
| `src/main/domain/ports/INotifier.ts`           | Typed push-notification port using `NotificationEventMap` — channels with `void` payloads require no args, data channels require typed payload |

### Use-Case Layer

| File                                             | Purpose                                                                                                                |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `src/main/use-cases/ProcessFileNotifications.ts` | Orchestrator: buffer → debounce → collapse → threshold check → reconcile or granular (stubbed) → notify `'db-updated'` |

### Interface-Adapter Layer

| File                                                           | Purpose                                                   |
| -------------------------------------------------------------- | --------------------------------------------------------- |
| `src/main/interface-adapters/queue/PQueueNotificationQueue.ts` | p-queue backed buffer with concurrency:1 serialized drain |

### Framework-Driver Layer

| File                                                      | Purpose                                                                           |
| --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `src/main/framework-drivers/timers/NodeDebouncer.ts`      | `setTimeout`/`clearTimeout` wrapper implementing `IDebouncer`                     |
| `src/main/framework-drivers/electron/ElectronNotifier.ts` | `BrowserWindow.getAllWindows().webContents.send()` implementing typed `INotifier` |

### Wiring

| File                | Change                                                                                                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main/index.ts` | Instantiates `PQueueNotificationQueue`, `NodeDebouncer`, `ElectronNotifier`, `ProcessFileNotifications` after reconciliation setup. Exports `processNotifications` for future ChokidarWatcher |

### Tests

| File                                                                  | Tests                                                                                                                                                    |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/main/domain/types/collapse-events.test.ts`                     | 26 tests — all file×file, dir×dir, mixed, multi-step, multi-path, IGNORE, unlisted-fallback cases                                                        |
| `tests/main/use-cases/ProcessFileNotifications.test.ts`               | 12 tests — enqueue, debounce scheduling, flush thresholds, IGNORE→skip, notify once, double-buffer flushing flag, post-flush re-schedule, error recovery |
| `tests/main/interface-adapters/queue/PQueueNotificationQueue.test.ts` | 8 tests — size, drain, empty drain, buffer isolation, disjoint snapshots, insertion order                                                                |
| `tests/main/framework-drivers/NodeDebouncer.test.ts`                  | 5 tests — timer fire, reset, cancel, cancel-when-idle, schedule-after-cancel                                                                             |

**Total: 125 tests (51 new), all passing. Coverage thresholds met.**

## Event Collapsing Rules

Per-path sequential collapse using a lookup table:

**File × File:** `add→add=add`, `add→change=add`, `add→unlink=IGNORE`, `change→change=change`, `change→unlink=unlink`, `unlink→add=change`, `unlink→change=change`, `unlink→unlink=unlink`

**Dir × Dir:** `addDir→addDir=addDir`, `addDir→unlinkDir=IGNORE`, `unlinkDir→addDir=change`, `unlinkDir→unlinkDir=unlinkDir`

**Mixed (dir dominates):** `addDir→add=addDir`, `add→addDir=addDir`, `unlinkDir→unlink=unlinkDir`, `unlink→unlinkDir=unlinkDir`

**Unlisted combinations:** latest event wins (safe fallback).

## Design Decisions

| Decision                | Value                           | Rationale                                                                                                                          |
| ----------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Debounce                | 1 000 ms                        | Captures full CapCut/yt-dlp bursts (~200-500ms) while user is in OS file manager                                                   |
| Reconcile threshold     | 50 collapsed events             | ~8-16 assets. Below: individual upserts cheaper (once granular path exists). Above: single reconciliation walk reuses FS snapshots |
| Granular path           | Stubbed → reconciliation        | PathClassifier + EntityMapper don't exist yet. Only the `else` branch in `flush()` changes later                                   |
| Double-buffer atomicity | p-queue concurrency: 1          | `drain()` serialized via p-queue task — buffer swap can never interleave with pending operations                                   |
| Event collapsing        | Pure function in domain/types   | Zero deps, fully testable, reusable by any consumer                                                                                |
| Typed notifier          | `NotificationEventMap` contract | Add new channels by extending the map — type safety enforced at compile time                                                       |

## Configuration Constants

Defined in `ProcessFileNotifications.ts` as named exports:

```typescript
export const RECONCILE_THRESHOLD = 50
export const DEBOUNCE_MS = 1000
```

## Future Integration Point

When `ChokidarWatcher` is implemented:

```typescript
// In src/main/index.ts, after watcher creation:
watcher.onEvent((event) => processNotifications.handleEvent(event))
```
