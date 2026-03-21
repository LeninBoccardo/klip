# Plan B: IPC Contract Enforcement, Audit/Operations Endpoints & Cleanup

## Context

This plan continues from the codebase review performed on 2026-03-20. Plan A (bug fixes, code quality, media enrichment) must be completed first — this plan depends on the schema, entities, and wiring changes introduced there.

**Prerequisite:** All tasks in `plan-codebaseReview-bugfixes-enrichment.prompt.md` (Plan A) are complete and passing.

## Decisions Made

- **IpcContract typed helpers** — `createTypedHandler` / `createTypedInvoker` enforce compile-time type safety across the IPC boundary. Controllers and preload use these instead of raw `ipcMain.handle` / `ipcRenderer.invoke`.
- **Audit log & operations are read-only for now** — the renderer can view data but not mutate it. This is the foundation for a future CTRL+Z undo system.
- **`AppSetting` entity** — either wire into `ISettingsRepository` or remove. Decide during implementation.
- **Repository method audit** — prune methods that are truly dead, keep those needed for upcoming UI phase.
- **Renderer is still untouched** — these are backend-only changes. The renderer will consume the new endpoints in a future UI phase.

---

## Task 1: IpcContract Typed Enforcement

**Goal:** Make `IpcContract` the single source of truth that is **enforced at compile time**, not just documentation. Controllers and preload must derive their types from the contract.

### 1a. Create typed handler helper

**New file:** `src/main/interface-adapters/controllers/create-typed-handler.ts`

```ts
import { ipcMain } from 'electron'
import type { IpcContract } from '@shared/ipc-contract'
import { IpcChannels } from '@shared/ipc-channels'

/**
 * Type-safe wrapper around ipcMain.handle.
 * Extracts param/result types from IpcContract for the given channel.
 *
 * Usage:
 *   createTypedHandler('get-creator-by-id', async (_event, id) => {
 *     return creatorRepo.findById(id)  // return type enforced by contract
 *   })
 */
export function createTypedHandler<C extends keyof IpcContract>(
  channel: C,
  handler: (
    event: Electron.IpcMainInvokeEvent,
    ...args: IpcContract[C]['params']
  ) => Promise<IpcContract[C]['result']> | IpcContract[C]['result']
): void {
  ipcMain.handle(channel, handler)
}
```

**Key design points:**

- The `channel` parameter is a key of `IpcContract`, so only valid channels compile
- The handler's params and return type are extracted from the contract — any mismatch is a compile error
- Push event channels (`db-updated`, `download-progress`) should NOT use this helper (they use `webContents.send`, not `ipcMain.handle`) — the type of `channel` parameter can be narrowed to exclude push channels if needed

### 1b. Create typed invoker helper for preload

**New file:** `src/preload/create-typed-invoker.ts`

```ts
import { ipcRenderer } from 'electron'
import type { IpcContract } from '@shared/ipc-contract'

/**
 * Type-safe wrapper around ipcRenderer.invoke.
 * Returns a function whose params and result match the IpcContract.
 *
 * Usage:
 *   const getCreatorById = createTypedInvoker('get-creator-by-id')
 *   // getCreatorById(id: string) => Promise<CreatorDto | null>
 */
export function createTypedInvoker<C extends keyof IpcContract>(
  channel: C
): (...args: IpcContract[C]['params']) => Promise<IpcContract[C]['result']> {
  return (...args: IpcContract[C]['params']) => ipcRenderer.invoke(channel, ...args)
}
```

### 1c. Refactor all controllers to use `createTypedHandler`

**Files to modify:**

- `src/main/interface-adapters/controllers/ReconcileController.ts`
- `src/main/interface-adapters/controllers/DownloadController.ts`
- `src/main/interface-adapters/controllers/CreatorController.ts`
- `src/main/interface-adapters/controllers/VideoController.ts`
- `src/main/interface-adapters/controllers/CutController.ts`
- `src/main/interface-adapters/controllers/SettingsController.ts`

**Example transformation (CreatorController):**

```ts
// Before:
ipcMain.handle(
  IpcChannels.GetCreatorById,
  async (_event, id: string): Promise<CreatorDto | null> => {
    return creatorRepo.findById(id)
  }
)

// After:
createTypedHandler('get-creator-by-id', async (_event, id) => {
  return creatorRepo.findById(id)
})
```

- Remove all `import { ipcMain } from 'electron'` from controllers (handled by the helper)
- Remove all manual type annotations on handler params/return — the contract enforces them
- Remove all `import type { ... } from '@shared/types'` that were only used for handler signatures (contract provides them)
- Keep `IpcChannels` import only if used for non-handler purposes; otherwise remove

### 1d. Refactor preload to use `createTypedInvoker`

**File to modify:**

- `src/preload/index.ts`

**Example transformation:**

```ts
// Before:
getCreatorById: (id: string): Promise<CreatorDto | null> =>
  ipcRenderer.invoke(IpcChannels.GetCreatorById, id),

// After:
getCreatorById: createTypedInvoker('get-creator-by-id'),
```

- Remove manual type imports that are now derived from the contract
- Push event listeners (`onDownloadProgress`, `onDbUpdated`) stay as-is — they use `ipcRenderer.on`, not `invoke`

### 1e. Update `preload/index.d.ts` to derive from contract

**File to modify:**

- `src/preload/index.d.ts`

The `KlipAPI` interface should ideally be **derived** from `IpcContract` so it can't drift. Approach:

```ts
import type { IpcContract } from '@shared/ipc-contract'

// Derive invoke methods from contract (request/response channels only)
type InvokeChannels = Exclude<keyof IpcContract, 'db-updated' | 'download-progress'>

type InvokeMethods = {
  [C in InvokeChannels as CamelCase<C>]: (
    ...args: IpcContract[C]['params']
  ) => Promise<IpcContract[C]['result']>
}
```

**Note:** The `CamelCase` utility type converts `'get-creator-by-id'` → `'getCreatorById'`. This is complex to implement perfectly with TS template literals. If too fragile, keep the manual interface but add a type-test that asserts each method matches the contract:

```ts
// Type-level assertion (compile-time only, no runtime cost):
type AssertMatch<C extends keyof IpcContract, Method extends (...args: any[]) => any> =
  Parameters<Method> extends IpcContract[C]['params']
    ? ReturnType<Method> extends Promise<IpcContract[C]['result']>
      ? true
      : never
    : never

// One per method:
type _checkGetCreatorById = AssertMatch<'get-creator-by-id', KlipAPI['getCreatorById']>
```

**Decision for implementor:** Choose whichever approach is cleaner. The manual interface + type assertions is simpler and more readable.

### 1f. Exclude push-event channels from handler helper

The `IpcContract` includes push channels (`db-updated`, `download-progress`) which use `webContents.send`, not `ipcMain.handle`. The `createTypedHandler` should only accept request/response channels.

**Approach:** Add a type to `ipc-contract.ts`:

```ts
/** Channels that use ipcMain.handle (request/response pattern) */
export type InvokeChannel = Exclude<keyof IpcContract, 'db-updated' | 'download-progress'>

/** Channels that use webContents.send (push pattern) */
export type PushChannel = 'db-updated' | 'download-progress'
```

Then constrain `createTypedHandler<C extends InvokeChannel>`.

### 1g. Tests

No new test files needed (controllers are excluded from coverage). But:

- **Run `npm run typecheck`** — this is the primary validation. Any contract mismatch becomes a compile error.
- Optionally add a type-level test file `tests/main/interface-adapters/controllers/ipc-contract-compliance.test-d.ts` using `vitest`'s `expectTypeOf` to assert all preload methods match the contract.

---

## Task 2: Audit Log IPC Endpoints (Read-Only)

**Goal:** Allow the renderer to view audit log entries. Foundation for future CTRL+Z undo system.

### 2a. Add IPC channels

**File to modify:** `src/shared/ipc-channels.ts`

```ts
// Add to IpcChannels:
// ── Audit Log ──
GetAuditLogByEntity: 'get-audit-log-by-entity',
GetAuditLogRecent: 'get-audit-log-recent',
```

### 2b. Add to IPC contract

**File to modify:** `src/shared/ipc-contract.ts`

```ts
// Add to IpcContract:
'get-audit-log-by-entity': {
  params: [entityType: string, entityId: string]
  result: AuditEntryDto[]
}
'get-audit-log-recent': {
  params: [limit: number]
  result: AuditEntryDto[]
}
```

### 2c. Create AuditEntryDto

**New file:** `src/shared/dtos/AuditEntryDto.ts`

```ts
import type { AuditAction } from '../../main/domain/entities/AuditEntry'

export interface AuditEntryDto {
  id: number
  entityType: string
  entityId: string
  action: string // Use string instead of AuditAction to keep shared layer decoupled from domain
  changes: string | null
  createdAt: string
}
```

**IMPORTANT:** The shared layer should NOT import from `src/main/domain/`. Use plain `string` for the `action` field in the DTO. The domain `AuditAction` type stays in the main process.

**Update:** `src/shared/dtos/index.ts` — add export for `AuditEntryDto`
**Update:** `src/shared/index.ts` — add re-export for `AuditEntryDto`

### 2d. Create AuditLogController

**New file:** `src/main/interface-adapters/controllers/AuditLogController.ts`

```ts
import type { IAuditLogRepository } from '@domain/repositories'
import { createTypedHandler } from './create-typed-handler'

export function registerAuditLogController(auditLogRepo: IAuditLogRepository): void {
  createTypedHandler('get-audit-log-by-entity', async (_event, entityType, entityId) => {
    return auditLogRepo.findByEntity(entityType, entityId)
  })

  createTypedHandler('get-audit-log-recent', async (_event, limit) => {
    return auditLogRepo.findRecent(limit)
  })
}
```

### 2e. Add preload methods

**File to modify:** `src/preload/index.ts`

```ts
// Add to api object:
getAuditLogByEntity: createTypedInvoker('get-audit-log-by-entity'),
getAuditLogRecent: createTypedInvoker('get-audit-log-recent'),
```

**File to modify:** `src/preload/index.d.ts`

```ts
// Add to KlipAPI:
getAuditLogByEntity(entityType: string, entityId: string): Promise<AuditEntryDto[]>
getAuditLogRecent(limit: number): Promise<AuditEntryDto[]>
```

### 2f. Register in index.ts

**File to modify:** `src/main/index.ts`

```ts
import { registerAuditLogController } from './interface-adapters/controllers/AuditLogController'
// ...
registerAuditLogController(container.repositories.auditLog)
```

---

## Task 3: Operations IPC Endpoints (Read-Only)

**Goal:** Allow the renderer to view operation history (saga log). Foundation for future undo system.

### 3a. Add IPC channels

**File to modify:** `src/shared/ipc-channels.ts`

```ts
// Add to IpcChannels:
// ── Operations ──
GetOperationById: 'get-operation-by-id',
GetOperationsByStatus: 'get-operations-by-status',
```

### 3b. Add to IPC contract

**File to modify:** `src/shared/ipc-contract.ts`

```ts
// Add to IpcContract:
'get-operation-by-id': {
  params: [id: string]
  result: OperationDto | null
}
'get-operations-by-status': {
  params: [status: string]
  result: OperationDto[]
}
```

### 3c. Create OperationDto

**New file:** `src/shared/dtos/OperationDto.ts`

```ts
export interface OperationDto {
  id: string
  type: string
  status: string
  payload: string
  error: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}
```

**Update:** `src/shared/dtos/index.ts` — add export
**Update:** `src/shared/index.ts` — add re-export

### 3d. Create OperationController

**New file:** `src/main/interface-adapters/controllers/OperationController.ts`

```ts
import type { IOperationRepository } from '@domain/repositories'
import type { OperationStatus } from '@domain/entities'
import { createTypedHandler } from './create-typed-handler'

export function registerOperationController(operationRepo: IOperationRepository): void {
  createTypedHandler('get-operation-by-id', async (_event, id) => {
    return operationRepo.findById(id)
  })

  createTypedHandler('get-operations-by-status', async (_event, status) => {
    return operationRepo.findByStatus(status as OperationStatus)
  })
}
```

### 3e. Add preload methods

**File to modify:** `src/preload/index.ts`

```ts
getOperationById: createTypedInvoker('get-operation-by-id'),
getOperationsByStatus: createTypedInvoker('get-operations-by-status'),
```

**File to modify:** `src/preload/index.d.ts`

```ts
getOperationById(id: string): Promise<OperationDto | null>
getOperationsByStatus(status: string): Promise<OperationDto[]>
```

### 3f. Register in index.ts

**File to modify:** `src/main/index.ts`

```ts
import { registerOperationController } from './interface-adapters/controllers/OperationController'
// ...
registerOperationController(container.repositories.operation)
```

---

## Task 4: `AppSetting` Entity Cleanup

**Issue:** `AppSetting` entity is defined in `src/main/domain/entities/AppSetting.ts` and exported from the barrel, but `ISettingsRepository` returns raw `string | null` — it never constructs or returns `AppSetting` objects.

**Decision:** Remove `AppSetting` entity. The settings table is a simple key-value store — wrapping each row in an entity object adds no value. The `ISettingsRepository` interface (`get`, `set`, `getAll`) is already clean.

**Files to modify:**

- `src/main/domain/entities/AppSetting.ts` — delete file
- `src/main/domain/entities/index.ts` — remove `export type { AppSetting } from './AppSetting'`

**Validation:** Run `npm run typecheck` to confirm nothing imports `AppSetting`.

---

## Task 5: Repository Method Audit

**Issue:** Several repository interface methods are defined and implemented but never called from any use-case, controller, or wiring code. Evaluate each.

### Methods to evaluate:

| Method            | Interface            | Called from                          | Decision                                                                              |
| ----------------- | -------------------- | ------------------------------------ | ------------------------------------------------------------------------------------- |
| `findAll()`       | `ICreatorRepository` | `ReconcileDirectory.executeInternal` | **KEEP** — used in full reconciliation                                                |
| `findAll()`       | `IVideoRepository`   | Tests only                           | **KEEP** — useful for upcoming UI (list all videos)                                   |
| `findAll()`       | `ICutRepository`     | Tests only                           | **KEEP** — useful for upcoming UI (list all cuts)                                     |
| `findAllActive()` | `ICreatorRepository` | Never                                | **KEEP** — will be used by UI for dropdown/filter                                     |
| `findAllActive()` | `IVideoRepository`   | Never                                | **KEEP** — same reason                                                                |
| `findAllActive()` | `ICutRepository`     | Never                                | **KEEP** — same reason                                                                |
| `delete(id)`      | `ICreatorRepository` | Never (app uses soft-delete)         | **EVALUATE** — keep if undo system may need hard-delete for cleanup, otherwise remove |
| `delete(id)`      | `IVideoRepository`   | Never                                | Same as above                                                                         |
| `delete(id)`      | `ICutRepository`     | Never                                | Same as above                                                                         |

**Recommendation:** Keep all methods for now. The upcoming UI phase and undo system will likely need them. Mark with `/** @internal Used by [future feature] */` JSDoc if desired.

**No code changes for this task** — document the decision only.

---

## Task 6: `DownloadVideo` `randomUUID` Import

**Issue:** `DownloadVideo` use case imports `randomUUID` directly from Node's `crypto` module, violating the clean architecture rule that use-cases should not import Node built-ins.

**Options:**

1. **Add `IIdGenerator` port** — clean but adds a port+adapter for a one-liner
2. **Accept as pragmatic** — `crypto.randomUUID()` is a stable, side-effect-free function available everywhere

**Recommendation:** Option 1 — add the port. It's a tiny interface, and it makes `DownloadVideo` fully testable without mocking Node modules. It also sets a precedent for any future use case that needs IDs.

### 6a. Create port interface

**New file:** `src/main/domain/ports/IIdGenerator.ts`

```ts
/**
 * Abstraction over unique ID generation.
 * Allows use-cases to generate IDs without importing Node's crypto module.
 */
export interface IIdGenerator {
  /** Generate a new unique identifier (UUID v4) */
  generate(): string
}
```

**Update:** `src/main/domain/ports/index.ts` — add export

### 6b. Create adapter

**New file:** `src/main/interface-adapters/crypto/NodeIdGenerator.ts` (or place in `file-system/` if preferred)

```ts
import { randomUUID } from 'crypto'
import type { IIdGenerator } from '@domain/ports'

export class NodeIdGenerator implements IIdGenerator {
  generate(): string {
    return randomUUID()
  }
}
```

### 6c. Update DownloadVideo

**File to modify:** `src/main/use-cases/DownloadVideo.ts`

- Remove `import { randomUUID } from 'crypto'`
- Add `IIdGenerator` to constructor dependencies
- Replace `randomUUID()` with `this.idGenerator.generate()`

### 6d. Wire in composition root

**File to modify:** `src/main/composition-root.ts`

- Instantiate `NodeIdGenerator`
- Pass to `DownloadVideo` constructor
- Optionally expose on `AppContainer.ports`

### 6e. Update tests

**File to modify:** `tests/main/use-cases/DownloadVideo.test.ts`

- Mock `IIdGenerator` with `vi.fn(() => 'test-uuid')`
- Remove any `crypto` mocking if present

---

## Execution Order

1. **Task 1a–1b** — Create typed handler/invoker helpers
2. **Task 1c–1d** — Refactor controllers and preload to use helpers
3. **Task 1e–1f** — Update type declarations and channel type constraints
4. **Task 1g** — Typecheck validation
5. **Task 2** — Audit log IPC endpoints (channels → contract → DTO → controller → preload → register)
6. **Task 3** — Operations IPC endpoints (same pattern)
7. **Task 4** — Remove `AppSetting` entity
8. **Task 6** — `IIdGenerator` port + adapter + DownloadVideo refactor
9. **Task 5** — Document repository method audit decision (no code changes)
10. **Run `npm run test:coverage`** — verify all tests pass
11. **Run `npm run typecheck`** — primary validation for IpcContract enforcement
12. **Run `npm run lint`** — verify no lint issues

---

## Validation Checklist

After all tasks are complete:

- [ ] `npm run typecheck` passes clean — **this is the primary check for Task 1**
- [ ] `npm run test:coverage` passes with ≥80% coverage
- [ ] `npm run lint` passes clean
- [ ] `npm run dev` starts without errors
- [ ] Intentionally mistype a handler return type in a controller → verify it produces a **compile error** (then revert)
- [ ] Intentionally mistype a preload invoker channel → verify it produces a **compile error** (then revert)
- [ ] Preload exposes `getAuditLogByEntity`, `getAuditLogRecent`, `getOperationById`, `getOperationsByStatus`
- [ ] `AppSetting` entity is gone, no imports reference it
- [ ] `DownloadVideo` no longer imports from `crypto`
