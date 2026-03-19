# Plan: Reconciliation System (DB ↔ File System)

## Status: IMPLEMENTED ✅

## Overview

Added `status` (`active`/`deleted`/`missing`) and `deletedAt` fields to all three entities, DB migration v2 for the new columns, updated every SQL query to default-filter `status = 'active'`, created a `ReconcileDirectory` use-case that walks the root folder and marks entities as `missing` when expected files are gone, and exposed it via IPC.

## What Was Built

### Domain Layer
| File | Change |
|---|---|
| `src/main/domain/types/entity-status.ts` | New — `EntityStatus` type literal union |
| `src/main/domain/types/pagination.ts` | Added `status?: EntityStatus[]` to `PaginationParams` |
| `src/main/domain/entities/Creator.ts` | Added `status`, `deletedAt` fields |
| `src/main/domain/entities/Video.ts` | Added `status`, `deletedAt` fields |
| `src/main/domain/entities/Cut.ts` | Added `status`, `deletedAt` fields |
| `src/main/domain/repositories/I*Repository.ts` | Added `updateStatus()`, `findAllActive()` to all three |
| `src/main/domain/ports/IFileSystemReader.ts` | New — FS abstraction interface |

### Infrastructure Layer
| File | Change |
|---|---|
| `src/main/framework-drivers/database/database.ts` | Migration v2 — `ALTER TABLE` adding `status` + `deleted_at` to all tables |
| `src/main/interface-adapters/repositories/Sqlite*Repository.ts` | All queries updated with status columns, new methods, status filter in pagination |
| `src/main/interface-adapters/file-system/NodeFileSystemReader.ts` | New — implements `IFileSystemReader` with sync Node `fs` |
| `src/main/interface-adapters/controllers/ReconcileController.ts` | New — IPC handler `ipcMain.handle('reconcile', ...)` |

### Use-Case Layer
| File | Change |
|---|---|
| `src/main/use-cases/ReconcileDirectory.ts` | New — core reconciliation pipeline |

### Wiring
| File | Change |
|---|---|
| `src/main/index.ts` | Wires `NodeFileSystemReader` → `ReconcileDirectory` → `registerReconcileController` |
| `src/preload/index.ts` | Exposes `api.reconcile()` |
| `src/preload/index.d.ts` | Types `ReconcileResult` and `KlipAPI` |

### Tests
| File | Tests |
|---|---|
| `tests/main/use-cases/ReconcileDirectory.test.ts` | 12 tests — mocked repos + fs, covers discovery, missing, recovery, cascade, deleted-skip, fallback metadata |
| Updated factory functions in all 3 repo test files | +`status: 'active'`, +`deletedAt: null` |
| `tests/main/framework-drivers/database.test.ts` | Updated for schema v2, added status column verification |
| `tests/main/interface-adapters/repositories/SqliteCreatorRepository.test.ts` | +4 tests for `updateStatus`, `findAllActive`, status-filtered pagination |

**Total: 74 tests, all passing**

## Reconciliation Algorithm

```
1. Snapshot DB creators (all statuses) + disk root directories
2. For each DB creator (skip status='deleted'):
   a. Folder exists → status='active', reconcile videos + cuts
   b. Folder missing → status='missing', cascade to children
3. For each disk folder NOT in DB → upsert new creator + scan children
4. Videos/Cuts follow the same pattern within each creator
```

Key rules: never hard-deletes, recovers `missing` → `active`, never touches `deleted`.

## Design Decisions

- **Hybrid sync approach**: FS reads are sync per directory, DB changes batched. Not fully atomic across FS+DB, but consistent with controlled state transitions.
- **Progressive metadata parsing**: `meta.json`/`cut-data.json` are authoritative when present. Folder names are fallback identity + provisional metadata.
- **Status in PaginationParams**: UI can filter by `status` array. Defaults to `['active']` when omitted.
- **`findAll()` stays unfiltered**: Reconciliation needs to see all statuses to compute diffs.

