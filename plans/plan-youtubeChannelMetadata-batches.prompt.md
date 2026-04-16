# Plan: YouTube Channel Metadata — Batch Execution Guide

## Status

**Batch 1: COMPLETE** (types, entities, schema, repositories, test factories)

---

## Batch 2: Drivers, Ports, Use Cases

**Goal:** Extract channel metadata from yt-dlp, add `fetchChannelInfo` port method, create `FetchChannelInfo` use case, enrich Creator during downloads, update ReconcileDirectory.

### Task 2.1 — Update `YtDlpDownloader.fetchInfo()` to extract channel fields

**File:** `src/main/framework-drivers/yt-dlp/YtDlpDownloader.ts`

**Current state (line 44–52):** The resolve block discards channel fields from yt-dlp JSON.

**Change:** Add 5 new fields to the resolved `VideoInfo` object:

```ts
resolve({
  videoId: json.id ?? '',
  title: json.title ?? json.fulltitle ?? '',
  channel: json.channel ?? json.uploader ?? null,
  duration: json.duration ?? null,
  thumbnailUrl: json.thumbnail ?? null,
  description: json.description ?? null,
  // ── New: channel metadata ──
  channelId: json.channel_id ?? null,
  channelUrl: json.channel_url ?? null,
  uploaderUrl: json.uploader_url ?? null,
  subscriberCount: json.channel_follower_count ?? null,
  viewCount: json.view_count ?? null
})
```

**Critical:** `VideoInfo` interface was already extended in Batch 1 (`src/shared/types/download.ts`), so this is just populating the fields.

---

### Task 2.2 — Update `YtDlpDownloader.buildResult()` to extract channel fields

**File:** `src/main/framework-drivers/yt-dlp/YtDlpDownloader.ts`

**Current state (line 233–284):** `buildResult()` reads `.info.json` but only extracts `title`, `duration`, `creatorName`. The returned `DownloadResult` is missing the 4 new fields.

**Change:** Extract `channelId`, `channelUrl`, `subscriberCount`, `viewCount` from the info JSON and include them in the return object:

```ts
let channelId: string | null = null
let channelUrl: string | null = null
let subscriberCount: number | null = null
let viewCount: number | null = null

if (existsSync(infoJsonPath)) {
  try {
    // ...existing title/duration/creatorName extraction...
    channelId = info.channel_id ?? null
    channelUrl = info.channel_url ?? null
    subscriberCount = info.channel_follower_count ?? null
    viewCount = info.view_count ?? null
    // ...existing meta.json write...
  } catch {
    /* Non-fatal */
  }
}

return {
  // ...existing fields...
  channelId,
  channelUrl,
  subscriberCount,
  viewCount
}
```

**Critical:** The `DownloadResult` interface was already extended in Batch 1. The existing return statement is missing the 4 new required fields — this will cause a **type error** until fixed.

---

### Task 2.3 — Add `fetchChannelInfo()` to `IVideoDownloader` port

**File:** `src/main/domain/ports/IVideoDownloader.ts`

**Current state (line 17–29):** Has `fetchInfo`, `download`, `cancel`.

**Change:** Add one method:

```ts
import type { DownloadProgress, DownloadResult, VideoInfo, ChannelInfo } from '@domain/types'

export interface IVideoDownloader {
  fetchInfo(url: string): Promise<VideoInfo>
  fetchChannelInfo(channelUrl: string): Promise<ChannelInfo>  // NEW
  download(...): Promise<DownloadResult>
  cancel(downloadId: string): void
}
```

**Critical:** This changes the port interface — all implementations (`YtDlpDownloader`) and all mocks (`mockDownloader()` in `DownloadVideo.test.ts`) must be updated.

---

### Task 2.4 — Implement `fetchChannelInfo()` in `YtDlpDownloader`

**File:** `src/main/framework-drivers/yt-dlp/YtDlpDownloader.ts`

**New method** (add after `fetchInfo`). Uses `--playlist-items 1 --dump-json --no-download` on a channel/handle URL to fetch the most recent video's metadata, which includes channel-level fields:

```ts
async fetchChannelInfo(channelUrl: string): Promise<ChannelInfo> {
  const bin = this.binaryResolver.resolve('yt-dlp')
  return new Promise<ChannelInfo>((resolve, reject) => {
    const args = ['--dump-json', '--playlist-items', '1', '--no-download', '--no-warnings', channelUrl]
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    proc.on('close', (code) => {
      if (code !== 0) { reject(new Error(`yt-dlp fetchChannelInfo failed (code ${code}): ${stderr.trim()}`)); return }
      try {
        const json = JSON.parse(stdout)
        resolve({
          channelId: json.channel_id ?? '',
          channelName: json.channel ?? json.uploader ?? '',
          channelUrl: json.channel_url ?? null,
          uploaderUrl: json.uploader_url ?? null,
          subscriberCount: json.channel_follower_count ?? null,
          avatarUrl: null
        })
      } catch (e) { reject(new Error(`yt-dlp fetchChannelInfo: failed to parse JSON: ${e}`)) }
    })
    proc.on('error', (err) => { reject(new Error(`yt-dlp fetchChannelInfo: failed to spawn: ${err.message}`)) })
  })
}
```

**Critical:** Import `ChannelInfo` type. Must be imported through domain types: `import type { ..., ChannelInfo } from '@domain/types'`.

---

### Task 2.5 — New use case interface: `IFetchChannelInfo`

**New file:** `src/main/use-cases/IFetchChannelInfo.ts`

```ts
import type { FetchChannelInfoResult } from '@domain/types'

export interface IFetchChannelInfo {
  execute(url: string): Promise<FetchChannelInfoResult>
}
```

**Critical:** `FetchChannelInfoResult` is defined canonically in `src/shared/types/use-case-results.ts` and re-exported through `src/main/domain/types/index.ts` (done in Batch 1). The use case interface re-uses it — no duplication.

---

### Task 2.6 — New use case implementation: `FetchChannelInfo`

**New file:** `src/main/use-cases/FetchChannelInfo.ts`

**Dependencies (constructor injection):**

- `IVideoDownloader` — calls `fetchChannelInfo(url)`
- `ICreatorRepository` — `findByYoutubeChannelId()`, `findByFolderName()`, `upsert()`

**Matching strategy:**

1. By `youtubeChannelId` (exact match — previously linked creator)
2. Fallback: `slugify(channelName)` → `findByFolderName()` (disk-discovered, not yet linked)

**Key logic:**

```ts
const channelInfo = await this.downloader.fetchChannelInfo(url.trim())
let creator = channelInfo.channelId
  ? this.creatorRepo.findByYoutubeChannelId(channelInfo.channelId)
  : null
if (!creator && channelInfo.channelName) {
  creator = this.creatorRepo.findByFolderName(slugify(channelInfo.channelName))
}
if (creator) {
  this.creatorRepo.upsert({
    ...creator,
    youtubeChannelId: channelInfo.channelId ?? creator.youtubeChannelId,
    youtubeChannelUrl: channelInfo.channelUrl ?? creator.youtubeChannelUrl,
    subscriberCount: channelInfo.subscriberCount ?? creator.subscriberCount,
    avatarUrl: channelInfo.avatarUrl ?? creator.avatarUrl,
    updatedAt: new Date().toISOString()
  })
}
return { channelInfo, creatorId: creator?.id ?? null, updated: !!creator }
```

**Critical:** Import `slugify` from `@domain/types`. Must NOT overwrite existing non-null Creator fields with null from channel info (the `??` coalescing pattern handles this).

---

### Task 2.7 — Enrich Creator during `DownloadVideo.performDownload()`

**File:** `src/main/use-cases/DownloadVideo.ts`

**Current state:** `ensureCreator(folderName, displayName)` creates new creators with null YouTube fields and only recovers missing ones.

**Changes:**

1. **Change signature** to `ensureCreator(folderName, displayName, info: VideoInfo)`:

```ts
private ensureCreator(folderName: string, displayName: string, info: VideoInfo): void {
  const existing = this.creatorRepo.findById(folderName)
  if (!existing) {
    // ...existing new creator code, but populate YouTube fields from info...
    youtubeChannelId: info.channelId ?? null,
    youtubeChannelUrl: info.channelUrl ?? null,
    subscriberCount: info.subscriberCount ?? null,
  } else if (existing.status === 'missing') {
    this.creatorRepo.updateStatus(folderName, 'active', null)
  } else if (!existing.youtubeChannelId && info.channelId) {
    // Backfill YouTube metadata on existing creator that lacks it
    this.creatorRepo.upsert({
      ...existing,
      youtubeChannelId: info.channelId,
      youtubeChannelUrl: info.channelUrl ?? existing.youtubeChannelUrl,
      subscriberCount: info.subscriberCount ?? existing.subscriberCount,
      updatedAt: new Date().toISOString()
    })
  }
}
```

2. **Update call site** in `performDownload()` (line 92):

```ts
this.ensureCreator(folderName, creatorName, info)
```

**Critical:** This changes the behavior of `ensureCreator` — the existing test "should not upsert or updateStatus for an existing active creator" will need to be updated. An active creator **without** `youtubeChannelId` will now get an upsert if `info.channelId` is available. The existing test uses `videoInfo` with `channelId: null`, so it should still pass. But new tests are needed to cover the backfill path.

**Also critical:** Need to import `VideoInfo` type in `DownloadVideo.ts` — it's already available via `@domain/types`.

---

### Task 2.8 — Tests for Batch 2

**2.8a — New file: `tests/main/use-cases/FetchChannelInfo.test.ts`**

Test cases:

- Returns channel info when no Creator match exists (`creatorId: null, updated: false`)
- Matches Creator by `youtubeChannelId` and upserts metadata
- Falls back to `slugify(channelName)` → `findByFolderName` when channelId doesn't match
- Does not overwrite existing non-null Creator fields with null
- Throws if URL is empty
- Returns `updated: true` when Creator was modified

Mock dependencies: `IVideoDownloader` (mock `fetchChannelInfo`), `ICreatorRepository` (mock `findByYoutubeChannelId`, `findByFolderName`, `upsert`).

**Critical for mock:** `mockDownloader()` in this file AND in `DownloadVideo.test.ts` must include `fetchChannelInfo: vi.fn()`.

**2.8b — Update `tests/main/use-cases/DownloadVideo.test.ts`**

Changes:

1. Add `fetchChannelInfo: vi.fn()` to `mockDownloader()` (Task 2.3 requires it)
2. New tests for `ensureCreator` enrichment:
   - Sets YouTube metadata on a new Creator when `info.channelId` is provided
   - Backfills YouTube metadata on existing active creator that lacks `youtubeChannelId`
   - Does NOT overwrite existing `youtubeChannelId` on a Creator
   - Video upsert includes `viewCount` from download result

**Critical:** The existing test at line 369 ("should not upsert or updateStatus for an existing active creator") uses `videoInfo` with `channelId: null` — it should still pass because the backfill condition is `!existing.youtubeChannelId && info.channelId`. But verify after implementation.

**2.8c — Update `tests/main/use-cases/ReconcileDirectory.test.ts`**

- Add test: `creator.json` with `youtubeChannelId` sets the field on the discovered Creator

---

## Batch 3: IPC Wiring & Integration

**Goal:** Wire the `FetchChannelInfo` use case to the IPC layer so the renderer can call it.

### Task 3.1 — Add IPC channel constant

**File:** `src/shared/ipc-channels.ts`

Add after `ProbeMediaFile` line (line 11):

```ts
// ── Channel ──
FetchChannelInfo: 'fetch-channel-info',
```

---

### Task 3.2 — Add IPC contract entry

**File:** `src/shared/ipc-contract.ts`

Add import for `FetchChannelInfoResult`:

```ts
import type { ..., FetchChannelInfoResult } from './types'
```

Add entry after `'probe-media-file'`:

```ts
'fetch-channel-info': { params: [url: string]; result: FetchChannelInfoResult }
```

---

### Task 3.3 — Update `DownloadController`

**File:** `src/main/interface-adapters/controllers/DownloadController.ts`

**Current state (line 15–18):** Accepts 3 dependencies.

**Change:** Add `IFetchChannelInfo` as 4th dependency:

```ts
import type { IFetchChannelInfo } from '@use-cases/IFetchChannelInfo'

export function registerDownloadController(
  fetchVideoInfo: IFetchVideoInfo,
  downloadVideo: IDownloadVideo,
  probeMediaFile: IProbeMediaFile,
  fetchChannelInfo: IFetchChannelInfo // NEW
): void {
  // ...existing handlers...

  createTypedHandler('fetch-channel-info', async (_event, url) => {
    return fetchChannelInfo.execute(url)
  })
}
```

---

### Task 3.4 — Add preload method

**File:** `src/preload/index.ts`

Add after `probeMediaFile` line (line 16):

```ts
fetchChannelInfo: createTypedInvoker('fetch-channel-info'),
```

**File:** `src/preload/index.d.ts`

Add import for `FetchChannelInfoResult`:

```ts
import type { ..., FetchChannelInfoResult } from '@shared/types'
```

Add to `KlipAPI` interface after `probeMediaFile`:

```ts
fetchChannelInfo(url: string): Promise<FetchChannelInfoResult>
```

---

### Task 3.5 — Wire in composition root

**File:** `src/main/composition-root.ts`

**Changes:**

1. Import:

```ts
import type { IFetchChannelInfo } from '@use-cases/IFetchChannelInfo'
import { FetchChannelInfo } from '@use-cases/FetchChannelInfo'
```

2. Add to `AppContainer.useCases` interface:

```ts
fetchChannelInfo: IFetchChannelInfo
```

3. Instantiate after `fetchVideoInfo` (line 165):

```ts
const fetchChannelInfo = new FetchChannelInfo(videoDownloader, creatorRepo)
```

4. Add to return object `useCases`:

```ts
fetchChannelInfo,
```

---

### Task 3.6 — Update `index.ts` controller registration

**File:** `src/main/index.ts`

**Current state (line 100–104):** `registerDownloadController` called with 3 args.

**Change:** Add 4th argument:

```ts
registerDownloadController(
  container.useCases.fetchVideoInfo,
  container.useCases.downloadVideo,
  container.useCases.probeMediaFile,
  container.useCases.fetchChannelInfo // NEW
)
```

---

### Task 3.7 — Validate

Run in order:

1. `npm run typecheck` — verify no type errors across main + renderer
2. `npm run lint` — verify no lint issues
3. `npm run test` (or `npx vitest run`) — verify all tests pass
4. `npm run dev` — verify app starts without errors

---

## Cross-Cutting Concerns

### Files touched across all batches (for quick reference):

| File                                                                   | B1     | B2     | B3  |
| ---------------------------------------------------------------------- | ------ | ------ | --- |
| `src/shared/types/channel-info.ts`                                     | ✅ new |        |     |
| `src/shared/types/download.ts`                                         | ✅     |        |     |
| `src/shared/types/use-case-results.ts`                                 | ✅     |        |     |
| `src/shared/types/index.ts`                                            | ✅     |        |     |
| `src/shared/index.ts`                                                  | ✅     |        |     |
| `src/shared/ipc-channels.ts`                                           |        |        | ✅  |
| `src/shared/ipc-contract.ts`                                           |        |        | ✅  |
| `src/shared/dtos/CreatorDto.ts`                                        | ✅     |        |     |
| `src/shared/dtos/VideoDto.ts`                                          | ✅     |        |     |
| `src/main/domain/entities/Creator.ts`                                  | ✅     |        |     |
| `src/main/domain/entities/Video.ts`                                    | ✅     |        |     |
| `src/main/domain/types/index.ts`                                       | ✅     |        |     |
| `src/main/domain/repositories/ICreatorRepository.ts`                   | ✅     |        |     |
| `src/main/domain/ports/IVideoDownloader.ts`                            |        | ✅     |     |
| `src/main/framework-drivers/database/schema.ts`                        | ✅     |        |     |
| `src/main/framework-drivers/database/database.ts`                      | ✅     |        |     |
| `src/main/framework-drivers/yt-dlp/YtDlpDownloader.ts`                 |        | ✅     |     |
| `src/main/interface-adapters/repositories/SqliteCreatorRepository.ts`  | ✅     |        |     |
| `src/main/interface-adapters/repositories/AuditedCreatorRepository.ts` | ✅     |        |     |
| `src/main/interface-adapters/repositories/SqliteVideoRepository.ts`    | ✅     |        |     |
| `src/main/interface-adapters/controllers/DownloadController.ts`        |        |        | ✅  |
| `src/main/use-cases/ReconcileDirectory.ts`                             | ✅     |        |     |
| `src/main/use-cases/DownloadVideo.ts`                                  | ✅     | ✅     |     |
| `src/main/use-cases/IFetchChannelInfo.ts`                              |        | ✅ new |     |
| `src/main/use-cases/FetchChannelInfo.ts`                               |        | ✅ new |     |
| `src/main/composition-root.ts`                                         |        |        | ✅  |
| `src/main/index.ts`                                                    |        |        | ✅  |
| `src/preload/index.ts`                                                 |        |        | ✅  |
| `src/preload/index.d.ts`                                               |        |        | ✅  |
| `tests/main/use-cases/FetchChannelInfo.test.ts`                        |        | ✅ new |     |
| `tests/main/use-cases/DownloadVideo.test.ts`                           | ✅     | ✅     |     |
| `tests/main/use-cases/ReconcileDirectory.test.ts`                      | ✅     | ✅     |     |
| 6 other test files (factories)                                         | ✅     |        |     |

### Type Error Risk Points

1. **`YtDlpDownloader.buildResult()` return** — Currently returns a `DownloadResult` missing 4 required fields (`channelId`, `channelUrl`, `subscriberCount`, `viewCount`). **This is a type error RIGHT NOW** that will show up in `npm run typecheck`. It must be fixed in Task 2.2.

2. **`IVideoDownloader` mock** — After Task 2.3 adds `fetchChannelInfo` to the interface, the `mockDownloader()` in `DownloadVideo.test.ts` will fail type checks. Must add `fetchChannelInfo: vi.fn()` to the mock.

3. **`DownloadVideo.ensureCreator()` signature change** — Task 2.7 changes `ensureCreator(folderName, displayName)` to `ensureCreator(folderName, displayName, info)`. All internal call sites must be updated (only one at line 92).

### Test Isolation

- `FetchChannelInfo.test.ts` is purely mock-based (no DB). Can run independently.
- `DownloadVideo.test.ts` is purely mock-based. The key risk is the `mockDownloader` shape change.
- `ReconcileDirectory.test.ts` is purely mock-based. The only Batch 2 change is adding one test for `creator.json` with `youtubeChannelId`.

### Execution Order within Batch 2

Must follow this order to avoid intermediate type errors:

1. **Task 2.1 + 2.2** — Fix `YtDlpDownloader` (resolves the type error on `DownloadResult`)
2. **Task 2.3 + 2.4** — Extend port interface + implementation
3. **Task 2.5 + 2.6** — New use case interface + implementation
4. **Task 2.7** — Enrich `DownloadVideo.ensureCreator()`
5. **Task 2.8** — All tests (factories, new test file, updated assertions)

### Execution Order within Batch 3

All tasks are independent in theory, but should be done in this order for clean commits:

1. **Task 3.1 + 3.2** — IPC channel + contract
2. **Task 3.3** — Controller
3. **Task 3.4** — Preload
4. **Task 3.5 + 3.6** — Composition root + index.ts wiring
5. **Task 3.7** — Validate everything

---

## Pre-existing Issue: `better-sqlite3` Native Module Mismatch

All DB integration tests (168 tests) currently fail with:

```
The module was compiled against NODE_MODULE_VERSION 145.
This version of Node.js requires NODE_MODULE_VERSION 127.
```

**Cause:** The `better-sqlite3` native addon was compiled for Node 23.x but the current shell runs Node 22.x.

**Fix:** Close any running dev server, then run `npm rebuild better-sqlite3`. If the `.node` file is locked, restart the machine or kill the process holding it.

**This is NOT caused by Batch 1 changes.** All mock-based tests (use-cases, queues, domain types, renderer) pass fine (329/497).
