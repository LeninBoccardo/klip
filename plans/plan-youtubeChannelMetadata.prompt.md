# Plan: YouTube Channel Metadata Retrieval

## Context

Klip already bundles `yt-dlp.exe` and uses it via `YtDlpDownloader` (framework-drivers layer) to download videos and fetch video info. The existing `fetchInfo(url)` calls `yt-dlp --dump-json --no-download` and extracts `videoId`, `title`, `channel`, `duration`, `thumbnailUrl`, `description` — but **ignores** several channel-level fields that yt-dlp already returns in the same JSON:

| yt-dlp JSON field        | Data                                    | Reliability              |
| ------------------------ | --------------------------------------- | ------------------------ |
| `channel_id`             | YouTube channel ID (e.g., `UCX6OQ3...`) | ✅ Consistent            |
| `channel`                | Channel display name                    | ✅ Consistent            |
| `channel_url`            | `https://youtube.com/channel/UCX6...`   | ✅ Consistent            |
| `channel_follower_count` | Subscriber count                        | ✅ Available since 2022+ |
| `uploader_url`           | `https://youtube.com/@handle`           | ✅ Consistent            |
| `view_count`             | Views for **that specific video**       | ✅ Per-video only        |

**Not directly available in one call:** total channel views, average views per video. Those require iterating all videos — heavy and fragile. Better to compute from indexed video data in the UI.

**Approach:** Extract channel metadata opportunistically during every `fetchInfo`/download call (zero extra yt-dlp invocations for the common path). Also provide an on-demand `FetchChannelInfo` use case + IPC endpoint for when the user wants to refresh stats or link a channel URL to a creator directly. No background polling — stays offline-first.

## Decisions Made

- **`VideoInfo` is extended** rather than creating a separate `ChannelInfo` return type for `fetchInfo` — avoids a second yt-dlp spawn for data already present in the same JSON.
- **A standalone `ChannelInfo` type** is still created for the on-demand `fetchChannelInfo()` port method (takes a channel/handle URL instead of a video URL).
- **`viewCount` on `Video`** — stored per-video at download time. The UI can compute "avg views per video" from indexed data.
- **No background polling** — subscriber counts and view counts go stale. Refresh only when the user explicitly triggers it (e.g., "Refresh Stats" button per creator) or piggyback on each new download from that creator.
- **Channel-to-Creator matching** — match by `youtubeChannelId` first, then fall back to `slugify(channelName)` → `findByFolderName`. This covers disk-discovered creators that later get linked to a YouTube channel.
- **`avatarUrl`** — yt-dlp's per-video `--dump-json` does NOT return the channel avatar (the `thumbnail` field is the video thumbnail). The `fetchChannelInfo` channel-page scrape can sometimes surface it via playlist metadata. Initially nullable — populated only when available.
- **Renderer is untouched** — these are backend-only changes. The renderer will consume the new fields in a future UI phase.

---

## Task 1: Add `ChannelInfo` Shared Type

**Goal:** Define the type returned by the on-demand channel info fetch (channel URL input, not video URL).

**New file:** `src/shared/types/channel-info.ts`

```ts
/**
 * YouTube channel metadata returned by on-demand channel info fetching.
 * Returned when the user provides a channel URL (e.g., youtube.com/@handle).
 */
export interface ChannelInfo {
  channelId: string
  channelName: string
  channelUrl: string | null
  uploaderUrl: string | null
  subscriberCount: number | null
  avatarUrl: string | null
}
```

**Files to update:**

- `src/shared/types/index.ts` — add `export type { ChannelInfo } from './channel-info'`
- `src/main/domain/types/index.ts` — add re-export: `export type { ChannelInfo } from '@shared/types'`

---

## Task 2: Extend `VideoInfo` with Channel Metadata + View Count

**Goal:** Every `fetchInfo` call already receives channel data from yt-dlp — surface it in the type rather than discarding it.

**File to modify:** `src/shared/types/download.ts`

**Changes to `VideoInfo`:**

```ts
/** Pre-flight video metadata fetched without downloading */
export interface VideoInfo {
  videoId: string
  title: string
  channel: string | null
  duration: number | null
  thumbnailUrl: string | null
  description: string | null
  // ── YouTube channel metadata (already in yt-dlp JSON) ──
  channelId: string | null
  channelUrl: string | null
  uploaderUrl: string | null
  subscriberCount: number | null
  viewCount: number | null
}
```

**Changes to `DownloadResult`:**

```ts
/** Successful download result returned by the downloader driver */
export interface DownloadResult {
  downloadId: string
  videoId: string
  creatorName: string
  filePath: string
  title: string
  duration: number | null
  thumbnailPath: string | null
  // ── YouTube channel metadata (from .info.json) ──
  channelId: string | null
  channelUrl: string | null
  subscriberCount: number | null
  viewCount: number | null
}
```

---

## Task 3: Extend `Creator` Entity & Schema

**Goal:** Store YouTube-specific metadata on the Creator entity. All fields nullable (creators can be disk-discovered without YouTube data).

### 3a. Update domain entity

**File to modify:** `src/main/domain/entities/Creator.ts`

```ts
export interface Creator {
  id: string
  folderName: string
  name: string
  profileImagePath: string | null
  youtubeChannelId: string | null
  youtubeChannelUrl: string | null
  subscriberCount: number | null
  avatarUrl: string | null
  status: EntityStatus
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}
```

### 3b. Update DTO

**File to modify:** `src/shared/dtos/CreatorDto.ts`

Add the four new nullable fields:

```ts
export interface CreatorDto {
  // ...existing fields...
  youtubeChannelId: string | null
  youtubeChannelUrl: string | null
  subscriberCount: number | null
  avatarUrl: string | null
  // ...existing fields...
}
```

### 3c. Update schema

**File to modify:** `src/main/framework-drivers/database/schema.ts`

Add to `creators` table definition:

```ts
youtubeChannelId: text('youtube_channel_id'),
youtubeChannelUrl: text('youtube_channel_url'),
subscriberCount: integer('subscriber_count'),
avatarUrl: text('avatar_url'),
```

Add new index:

```ts
;(table) => [
  index('idx_creators_status').on(table.status),
  index('idx_creators_yt_channel_id').on(table.youtubeChannelId)
]
```

**Then run:** `npm run db:generate` to create migration SQL.

### 3d. Update `pushSchema()`

**File to modify:** `src/main/framework-drivers/database/database.ts`

Add the four columns to the creators `CREATE TABLE` statement:

```sql
youtube_channel_id TEXT,
youtube_channel_url TEXT,
subscriber_count INTEGER,
avatar_url TEXT,
```

Add the new index:

```sql
CREATE INDEX IF NOT EXISTS idx_creators_yt_channel_id ON creators(youtube_channel_id)
```

---

## Task 4: Extend `Video` Entity with `viewCount`

### 4a. Update domain entity

**File to modify:** `src/main/domain/entities/Video.ts`

Add `viewCount: number | null` field.

### 4b. Update DTO

**File to modify:** `src/shared/dtos/VideoDto.ts`

Add `viewCount: number | null` field.

### 4c. Update schema

**File to modify:** `src/main/framework-drivers/database/schema.ts`

Add to `videos` table definition:

```ts
viewCount: integer('view_count'),
```

**Then run:** `npm run db:generate` (combined with Task 3c into a single migration).

### 4d. Update `pushSchema()`

**File to modify:** `src/main/framework-drivers/database/database.ts`

Add `view_count INTEGER` to the videos `CREATE TABLE` statement.

---

## Task 5: Update `YtDlpDownloader.fetchInfo()`

**Goal:** Extract the channel metadata fields that yt-dlp already returns but we currently discard.

**File to modify:** `src/main/framework-drivers/yt-dlp/YtDlpDownloader.ts`

**Changes in `fetchInfo()` resolve block:**

```ts
const json = JSON.parse(stdout)
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

---

## Task 6: Update `YtDlpDownloader.buildResult()`

**Goal:** Also extract channel metadata + view count from the `.info.json` written during download.

**File to modify:** `src/main/framework-drivers/yt-dlp/YtDlpDownloader.ts`

**Changes in `buildResult()`:**

```ts
let channelId: string | null = null
let channelUrl: string | null = null
let subscriberCount: number | null = null
let viewCount: number | null = null

if (existsSync(infoJsonPath)) {
  try {
    const raw = readFileSync(infoJsonPath, 'utf-8')
    const info = JSON.parse(raw)
    title = info.title ?? info.fulltitle ?? videoId
    duration = info.duration ?? null
    creatorName = info.channel ?? info.uploader ?? ''
    channelId = info.channel_id ?? null
    channelUrl = info.channel_url ?? null
    subscriberCount = info.channel_follower_count ?? null
    viewCount = info.view_count ?? null
    // ... existing meta.json write ...
  } catch {
    /* Non-fatal */
  }
}

return {
  downloadId,
  videoId,
  creatorName,
  filePath: mediaFile ? join(outputDir, mediaFile) : outputDir,
  title,
  duration,
  thumbnailPath: thumbnailFile ? join(outputDir, thumbnailFile) : null,
  channelId,
  channelUrl,
  subscriberCount,
  viewCount
}
```

---

## Task 7: Add `fetchChannelInfo()` to `IVideoDownloader` Port

**Goal:** Add an on-demand channel info method for when the user provides a channel/handle URL.

### 7a. Extend port interface

**File to modify:** `src/main/domain/ports/IVideoDownloader.ts`

```ts
import type { DownloadProgress, DownloadResult, VideoInfo, ChannelInfo } from '@domain/types'

export interface IVideoDownloader {
  fetchInfo(url: string): Promise<VideoInfo>
  fetchChannelInfo(channelUrl: string): Promise<ChannelInfo>
  download(
    options: DownloadOptions,
    onProgress: (progress: DownloadProgress) => void
  ): Promise<DownloadResult>
  cancel(downloadId: string): void
}
```

### 7b. Implement in `YtDlpDownloader`

**File to modify:** `src/main/framework-drivers/yt-dlp/YtDlpDownloader.ts`

**New method:**

```ts
async fetchChannelInfo(channelUrl: string): Promise<ChannelInfo> {
  const bin = this.binaryResolver.resolve('yt-dlp')

  return new Promise<ChannelInfo>((resolve, reject) => {
    // Fetch metadata from the channel's most recent video
    const args = [
      '--dump-json',
      '--playlist-items', '1',
      '--no-download',
      '--no-warnings',
      channelUrl
    ]
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp fetchChannelInfo failed (code ${code}): ${stderr.trim()}`))
        return
      }

      try {
        const json = JSON.parse(stdout)
        resolve({
          channelId: json.channel_id ?? '',
          channelName: json.channel ?? json.uploader ?? '',
          channelUrl: json.channel_url ?? null,
          uploaderUrl: json.uploader_url ?? null,
          subscriberCount: json.channel_follower_count ?? null,
          avatarUrl: null // Not reliably available from per-video metadata
        })
      } catch (e) {
        reject(new Error(`yt-dlp fetchChannelInfo: failed to parse JSON: ${e}`))
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`yt-dlp fetchChannelInfo: failed to spawn process: ${err.message}`))
    })
  })
}
```

**Note:** `--playlist-items 1` fetches only the first (most recent) video from the channel page, which includes the channel-level metadata. This avoids scraping the entire channel.

---

## Task 8: Add `findByYoutubeChannelId` to Creator Repository

### 8a. Update repository interface

**File to modify:** `src/main/domain/repositories/ICreatorRepository.ts`

```ts
export interface ICreatorRepository {
  // ...existing methods...
  findByYoutubeChannelId(channelId: string): Creator | null
}
```

### 8b. Implement in `SqliteCreatorRepository`

**File to modify:** `src/main/interface-adapters/repositories/SqliteCreatorRepository.ts`

```ts
findByYoutubeChannelId(channelId: string): Creator | null {
  const row = this.db
    .select()
    .from(creators)
    .where(eq(creators.youtubeChannelId, channelId))
    .get()
  return row ? mapRow(row) : null
}
```

Also update:

- `mapRow()` — no changes needed if using spread (Drizzle maps automatically), but verify new columns are present
- `upsert()` — add the four new columns to both `.values()` and `.onConflictDoUpdate()` `.set()`
- `SORT_COLUMNS` — add `subscriberCount: creators.subscriberCount`

### 8c. Update `AuditedCreatorRepository`

**File to modify:** `src/main/interface-adapters/repositories/AuditedCreatorRepository.ts`

Add pass-through (read-only — no audit needed):

```ts
findByYoutubeChannelId(channelId: string): Creator | null {
  return this.inner.findByYoutubeChannelId(channelId)
}
```

---

## Task 9: Update `SqliteVideoRepository`

**File to modify:** `src/main/interface-adapters/repositories/SqliteVideoRepository.ts`

- `upsert()` — add `viewCount` to both `.values()` and `.onConflictDoUpdate()` `.set()`
- `SORT_COLUMNS` — add `viewCount: videos.viewCount`

No `mapRow` changes needed — Drizzle handles the new column automatically via spread.

---

## Task 10: New Use Case — `FetchChannelInfo`

**Goal:** On-demand channel info fetching. Takes a channel/handle/video URL, resolves metadata via yt-dlp, matches to an existing Creator, upserts YouTube metadata.

### 10a. Interface

**New file:** `src/main/use-cases/IFetchChannelInfo.ts`

```ts
import type { ChannelInfo } from '@domain/types'

export interface FetchChannelInfoResult {
  channelInfo: ChannelInfo
  creatorId: string | null // null if no matching Creator found in DB
  updated: boolean // true if Creator was updated with new metadata
}

export interface IFetchChannelInfo {
  execute(url: string): Promise<FetchChannelInfoResult>
}
```

### 10b. Implementation

**New file:** `src/main/use-cases/FetchChannelInfo.ts`

```ts
import type { IVideoDownloader } from '@domain/ports'
import type { ICreatorRepository } from '@domain/repositories'
import type { ChannelInfo } from '@domain/types'
import { slugify } from '@domain/types'
import type { IFetchChannelInfo, FetchChannelInfoResult } from './IFetchChannelInfo'

/**
 * Fetches YouTube channel metadata via yt-dlp and optionally
 * links it to an existing Creator in the database.
 *
 * Matching strategy:
 *   1. By youtubeChannelId (exact match — previously linked)
 *   2. By slugify(channelName) → findByFolderName (disk-discovered, not yet linked)
 *
 * If a Creator is found, upserts the YouTube metadata fields.
 */
export class FetchChannelInfo implements IFetchChannelInfo {
  constructor(
    private downloader: IVideoDownloader,
    private creatorRepo: ICreatorRepository
  ) {}

  async execute(url: string): Promise<FetchChannelInfoResult> {
    if (!url || url.trim().length === 0) {
      throw new Error('URL is required')
    }

    const channelInfo = await this.downloader.fetchChannelInfo(url.trim())

    // Try to match to an existing Creator
    let creator = channelInfo.channelId
      ? this.creatorRepo.findByYoutubeChannelId(channelInfo.channelId)
      : null

    // Fallback: match by slugified channel name → folder name
    if (!creator && channelInfo.channelName) {
      const folderName = slugify(channelInfo.channelName)
      creator = this.creatorRepo.findByFolderName(folderName)
    }

    let updated = false
    if (creator) {
      const now = new Date().toISOString()
      this.creatorRepo.upsert({
        ...creator,
        youtubeChannelId: channelInfo.channelId ?? creator.youtubeChannelId,
        youtubeChannelUrl: channelInfo.channelUrl ?? creator.youtubeChannelUrl,
        subscriberCount: channelInfo.subscriberCount ?? creator.subscriberCount,
        avatarUrl: channelInfo.avatarUrl ?? creator.avatarUrl,
        updatedAt: now
      })
      updated = true
    }

    return {
      channelInfo,
      creatorId: creator?.id ?? null,
      updated
    }
  }
}
```

---

## Task 11: Enrich Creator During `DownloadVideo.performDownload()`

**Goal:** After the pre-flight `fetchInfo` call (which now returns channel metadata), backfill YouTube fields on the Creator. After download completes, set `viewCount` on the Video entity.

**File to modify:** `src/main/use-cases/DownloadVideo.ts`

### 11a. Update `ensureCreator()` to accept `VideoInfo`

```ts
private ensureCreator(folderName: string, displayName: string, info: VideoInfo): void {
  const existing = this.creatorRepo.findById(folderName)
  if (!existing) {
    const now = new Date().toISOString()
    const creator: Creator = {
      id: folderName,
      folderName,
      name: displayName,
      profileImagePath: null,
      youtubeChannelId: info.channelId ?? null,
      youtubeChannelUrl: info.channelUrl ?? null,
      subscriberCount: info.subscriberCount ?? null,
      avatarUrl: null,
      status: 'active',
      deletedAt: null,
      createdAt: now,
      updatedAt: now
    }
    this.creatorRepo.upsert(creator)
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

### 11b. Update `performDownload()` call site

Change `this.ensureCreator(folderName, creatorName)` → `this.ensureCreator(folderName, creatorName, info)`.

### 11c. Set `viewCount` on Video upsert

In `performDownload()`, where the `Video` entity is built for upsert, add:

```ts
const video: Video = {
  // ...existing fields...
  viewCount: result.viewCount ?? info.viewCount ?? null
  // ...existing fields...
}
```

---

## Task 12: New IPC Endpoint — `fetch-channel-info`

### 12a. Add channel constant

**File to modify:** `src/shared/ipc-channels.ts`

```ts
// ── Channel ──
FetchChannelInfo: 'fetch-channel-info',
```

### 12b. Add to IPC contract

**File to modify:** `src/shared/ipc-contract.ts`

```ts
import type { ..., ChannelInfo } from './types'

// In IpcContract:
'fetch-channel-info': {
  params: [url: string]
  result: FetchChannelInfoResult
}
```

Also add `FetchChannelInfoResult` to `src/shared/types/use-case-results.ts`:

```ts
import type { ChannelInfo } from './channel-info'

export interface FetchChannelInfoResult {
  channelInfo: ChannelInfo
  creatorId: string | null
  updated: boolean
}
```

**Note:** The use-case interface (`IFetchChannelInfo`) should re-export from shared, not define its own `FetchChannelInfoResult`, to follow the canonical type ownership pattern.

### 12c. Update controller

**File to modify:** `src/main/interface-adapters/controllers/DownloadController.ts`

Add the new handler (it fits with download/media operations):

```ts
export function registerDownloadController(
  fetchVideoInfo: IFetchVideoInfo,
  downloadVideo: IDownloadVideo,
  probeMediaFile: IProbeMediaFile,
  fetchChannelInfo: IFetchChannelInfo // new dependency
): void {
  // ...existing handlers...

  createTypedHandler('fetch-channel-info', async (_event, url) => {
    return fetchChannelInfo.execute(url)
  })
}
```

### 12d. Add preload method

**File to modify:** `src/preload/index.ts`

```ts
fetchChannelInfo: createTypedInvoker('fetch-channel-info'),
```

**File to modify:** `src/preload/index.d.ts`

```ts
import type { ..., FetchChannelInfoResult, ChannelInfo } from '@shared/types'

// In KlipAPI:
fetchChannelInfo(url: string): Promise<FetchChannelInfoResult>
```

### 12e. Register in index.ts

**File to modify:** `src/main/index.ts`

Update `registerDownloadController` call to pass the new use case:

```ts
registerDownloadController(
  container.useCases.fetchVideoInfo,
  container.useCases.downloadVideo,
  container.useCases.probeMediaFile,
  container.useCases.fetchChannelInfo // new
)
```

---

## Task 13: Wire in Composition Root

**File to modify:** `src/main/composition-root.ts`

- Import `FetchChannelInfo` and `IFetchChannelInfo`
- Instantiate: `const fetchChannelInfo = new FetchChannelInfo(videoDownloader, creatorRepo)`
- Add to `AppContainer.useCases`: `fetchChannelInfo: IFetchChannelInfo`
- Add to the return object

---

## Task 14: Update `ReconcileDirectory` — New Creator Fields

**File to modify:** `src/main/use-cases/ReconcileDirectory.ts`

When creating a new `Creator` entity (in both `executeInternal` and `executeForCreatorInternal`), add the new nullable fields with default `null`:

```ts
const newCreator: Creator = {
  // ...existing fields...
  youtubeChannelId: null,
  youtubeChannelUrl: null,
  subscriberCount: null,
  avatarUrl: null
  // ...existing fields...
}
```

**Also update `creator.json` parsing** — optionally support `youtubeChannelId` and `youtubeChannelUrl` in the `CreatorJson` interface so users can manually set them via the JSON file:

```ts
interface CreatorJson {
  name?: string
  profileImagePath?: string
  youtubeChannelId?: string
  youtubeChannelUrl?: string
}
```

And use them when building the Creator entity:

```ts
youtubeChannelId: creatorJson?.youtubeChannelId ?? null,
youtubeChannelUrl: creatorJson?.youtubeChannelUrl ?? null,
```

---

## Task 15: Tests

### 15a. Update test factories

**Files to modify:** All test files that use `makeCreator()` / `makeVideo()` factory functions.

Add new fields with `null` defaults:

```ts
function makeCreator(overrides: Partial<Creator> = {}): Creator {
  return {
    // ...existing defaults...
    youtubeChannelId: null,
    youtubeChannelUrl: null,
    subscriberCount: null,
    avatarUrl: null,
    ...overrides
  }
}

function makeVideo(overrides: Partial<Video> = {}): Video {
  return {
    // ...existing defaults...
    viewCount: null,
    ...overrides
  }
}
```

### 15b. New test file: `tests/main/use-cases/FetchChannelInfo.test.ts`

Test cases:

- Fetches channel info and returns it when no Creator match exists
- Matches Creator by `youtubeChannelId` and upserts metadata
- Falls back to matching by `slugify(channelName)` → `findByFolderName` when `youtubeChannelId` doesn't match
- Does not overwrite existing non-null Creator fields with null from channel info
- Throws if URL is empty
- Returns `updated: true` when Creator was modified, `false` when no match
- Returns `creatorId` when matched, `null` when not

### 15c. Update `tests/main/use-cases/DownloadVideo.test.ts`

New test cases:

- `ensureCreator` sets YouTube metadata fields on a new Creator from `VideoInfo`
- `ensureCreator` backfills YouTube metadata on an existing Creator that lacks `youtubeChannelId`
- `ensureCreator` does NOT overwrite existing `youtubeChannelId` on a Creator
- Video upsert includes `viewCount` from download result
- Video upsert falls back to `info.viewCount` when `result.viewCount` is null

Update existing mock `VideoInfo` to include the new fields (defaulting to `null`).

### 15d. Update repository tests

**`tests/main/interface-adapters/repositories/SqliteCreatorRepository.test.ts`:**

- Test `findByYoutubeChannelId` — returns Creator when found, null when not
- Test upsert with YouTube metadata fields — persists and retrieves correctly
- Test sort by `subscriberCount`

**`tests/main/interface-adapters/repositories/SqliteVideoRepository.test.ts`:**

- Test upsert with `viewCount` — persists and retrieves correctly
- Test sort by `viewCount`

### 15e. Update `tests/main/use-cases/ReconcileDirectory.test.ts`

- Update `makeCreator` calls to include the new null fields
- Add test: `creator.json` with `youtubeChannelId` sets the field on the discovered Creator

---

## Execution Order

1. **Task 1** — Add `ChannelInfo` shared type (foundation, no deps)
2. **Task 2** — Extend `VideoInfo` and `DownloadResult` types (standalone)
3. **Task 3a–3b** — Extend `Creator` entity + DTO
4. **Task 4a–4b** — Extend `Video` entity + DTO
5. **Task 3c + 4c** — Schema migration (both tables in one `db:generate`)
6. **Task 3d + 4d** — Update `pushSchema()` for tests
7. **Task 8** — Add `findByYoutubeChannelId` to repository interface + implementations
8. **Task 9** — Update `SqliteVideoRepository` for `viewCount`
9. **Task 14** — Update `ReconcileDirectory` with new Creator fields
10. **Task 15a** — Update test factories
11. **Task 5** — Update `YtDlpDownloader.fetchInfo()`
12. **Task 6** — Update `YtDlpDownloader.buildResult()`
13. **Task 7** — Add `fetchChannelInfo()` to port + YtDlpDownloader
14. **Task 10** — New use case `FetchChannelInfo`
15. **Task 11** — Enrich Creator during `DownloadVideo.performDownload()`
16. **Task 12** — New IPC endpoint `fetch-channel-info`
17. **Task 13** — Wire in composition root
18. **Task 15b–15e** — All tests
19. **Run `npm run test:coverage`** — verify all tests pass, coverage thresholds met
20. **Run `npm run typecheck`** — verify no type errors
21. **Run `npm run lint`** — verify no lint issues

---

## Further Considerations

1. **Avatar URL reliability:** yt-dlp's per-video `--dump-json` does not return the channel avatar. The `fetchChannelInfo` method using `--playlist-items 1` also returns per-video metadata, not a channel profile picture. To reliably get the avatar, a future enhancement could parse the channel page HTML or use the YouTube Data API (requires API key — violates offline-first). For v1, `avatarUrl` will remain `null` from yt-dlp calls. Users can set it manually via `creator.json → profileImagePath`.

2. **Subscriber count staleness:** Since there's no background polling, `subscriberCount` reflects the value at last download/fetch time. The UI should display it with a "last updated" indicator (can use `creator.updatedAt`).

3. **Rate limiting:** yt-dlp respects YouTube's rate limits. The `fetchChannelInfo` on-demand call spawns a single yt-dlp process. No special throttling needed beyond the existing `PQueueDownloadQueue` for downloads.

4. **`viewCount` volatility:** View counts change constantly. The stored value is a snapshot at download time. A future "refresh stats" feature could re-run `fetchInfo` on existing video URLs to update `viewCount` + `subscriberCount`.

---

## Validation Checklist

After all tasks are complete:

- [ ] `npm run test:coverage` passes with ≥80% coverage
- [ ] `npm run typecheck` passes clean
- [ ] `npm run lint` passes clean
- [ ] `npm run dev` starts without errors
- [ ] Schema migration applies cleanly (`npm run db:generate` produced valid SQL)
- [ ] `pushSchema()` matches the production schema (in-memory tests work)
- [ ] `FetchChannelInfo` use case correctly matches Creator by `youtubeChannelId` and by `slugify(channelName)`
- [ ] `DownloadVideo` backfills YouTube metadata on Creator after successful download
- [ ] `VideoInfo` and `DownloadResult` now include channel metadata fields
- [ ] New `findByYoutubeChannelId` repo method works correctly
- [ ] Existing tests updated with new entity fields (no `undefined` leaks)
- [ ] `creator.json` supports optional `youtubeChannelId` and `youtubeChannelUrl` fields
