# Audit 03 — Performance

**Method:** read all 9 surfaces named in the Step-3 plan; computed Big-O complexity in terms of N (creators) and V (videos per creator); cross-referenced every `WHERE` / `ORDER BY` against the actual indexes in [schema.ts](src/main/framework-drivers/database/schema.ts). No benchmarks were run — complexity analysis only, per the plan.

**Baseline for impact estimates:** **N = 100 creators × V = 50 videos = 5K total entities**. Findings include "what this costs at 5K" so triage can drop anything that doesn't actually hurt.

**Severity rubric (per plan):**

- **HIGH** — noticeable at 5K (UI freeze, multi-second startup, unresponsive list).
- **MEDIUM** — measurable at 5K but not user-visible; will bite at 10×.
- **LOW** — defensive note for future scale or a smell-with-perf-flavor.

**Headline:** no HIGH findings at the 5K baseline. The codebase scales reasonably. Five MEDIUM findings, mostly around the new audit-decorator overhead from R1-B3 and unindexed sort/filter columns. Five LOW findings worth noting but not pushing.

---

## MEDIUM

### M1. Audited repos do a redundant `findById` SELECT per mutation; in batch flows the caller already has the row

**Location:** [AuditedCreatorRepository.ts:38, AuditedVideoRepository.ts:43, AuditedCutRepository.ts:47](src/main/interface-adapters/repositories/) (and similar in `updateStatus` / `updateProbeStatus`).

**Cost at baseline:** every `upsert` does `findById` + `inner.upsert` + `auditLog.append` inside a transaction. The `findById` exists only to compute `diffObjects` for the audit `changes` field. In batch flows like [ReconcileDirectory.executeInternal](src/main/use-cases/ReconcileDirectory.ts:73), the caller has **just queried** the entity via `findByCreatorId` or `findAll` — it has the old row in hand. The decorator throws it away and re-reads from disk by primary key.

At 5K reconciled entities = **5K extra primary-key SELECTs** per startup. PK lookups are ~10µs each in better-sqlite3, so ~50ms wall-clock. Not catastrophic but the highest-leverage fix in this audit because it's a Reconcile-on-startup cost paid every launch.

**Recommendation:** add a sibling method that takes the previous state explicitly, e.g. `upsertWithPrevious(entity, previous: T | null)`. Reconcile passes the row it already has; the decorator skips the redundant SELECT and goes straight to `inner.upsert` + `auditLog.append`. Keep the existing `upsert(entity)` for callers that don't have the prior state (controllers, FetchVideoDetail, DownloadVideo). No outer-API breakage.

Alt: cache the last-seen value per id in a per-transaction WeakMap. More complex; rejected.

---

### M2. Reconcile fans out to per-creator `findByCreatorId` queries; one bulk fetch would do

**Location:** [ReconcileDirectory.ts:202, :298](src/main/use-cases/ReconcileDirectory.ts) inside the `for (const creator of dbCreators)` loop in [executeInternal](src/main/use-cases/ReconcileDirectory.ts:73).

**Cost at baseline:** N creators × 2 queries (videos + cuts) = **200 indexed lookups** during full reconcile. Each query is `WHERE creator_id = ?` against `idx_videos_creator_id` / `idx_cuts_creator_id` — fast individually (~1ms with prepared statement reuse). Total ~200ms.

The classic N+1 pattern: we already know we want every active video and every active cut; we're issuing 2N queries when 2 would do.

**Recommendation:** at the top of `executeInternal`, fetch `videoRepo.findAll()` and `cutRepo.findAll()` once, then `groupBy(creatorId)` into `Map<string, Video[]>` / `Map<string, Cut[]>`. `reconcileVideos` / `reconcileCuts` look up from the map instead of re-querying. Same complexity in big-O (still O(N+V+C)) but the constant factor drops by 2N statements. Saves ~150ms at 5K, scales linearly with creator count.

---

### M3. `processGranular` opens one transaction per affected creator instead of one for the whole batch

**Location:** [ProcessFileNotifications.processGranular](src/main/use-cases/ProcessFileNotifications.ts:140) → calls [reconcile.executeForCreator](src/main/use-cases/ReconcileDirectory.ts:67) once per affected creator. Each `executeForCreator` opens its own `transaction.run(...)`.

**Cost at baseline:** typical bursts touch 1–10 creators, so 1–10 transactions per flush. Each BEGIN/COMMIT pair in better-sqlite3 is ~50–100µs plus the WAL fsync (cheap with WAL mode). At 5–10 transactions per second on a busy reconcile, the BEGIN/COMMIT overhead is ~1ms total — not user-visible.

But: each transaction also commits the audit-log writes for that batch independently. If the user runs an "import 200 folders" workflow, that's 200 separate transactions = 200 fsyncs. WAL mode amortizes most of this but still measurable.

**Recommendation:** add a `processGranular` sibling that opens one outer `transaction.run(...)` and calls a non-transactional internal variant per creator. Keep `executeForCreator` for the public single-creator API.

Lower priority than M1/M2 because typical event bursts are small.

---

### M4. Video sort allowlist exposes columns that aren't indexed → full sort at scale

**Location:** [SqliteVideoRepository.ts:13](src/main/interface-adapters/repositories/SqliteVideoRepository.ts).

**Cost at baseline:** `SORT_COLUMNS` includes `title`, `duration`, `fileSize`, `viewCount`, `likeCount`, `uploadDate`, `downloadDate`, `updatedAt`. Of these, only `createdAt` benefits from a useful index (`idx_videos_status_created`). The rest force SQLite to sort the entire filtered set in memory.

For a creator's video list at V=50, filtered by `creatorId`, sorting in memory is trivial (~1ms). For the full library at V=5K filtered only by status, sorting by an unindexed column is ~5–20ms — borderline noticeable on slower machines.

**Recommendation:**

- If users actually sort by `viewCount` / `likeCount` / `uploadDate` (engagement-driven browsing), add composite indexes `(status, viewCount DESC)` etc. for the most common ones.
- Alternative: leave alone for now; revisit when telemetry or a user complaint flags it. Most users will sort by `createdAt` (newest first), which is already covered.

Flag for now; recommendation: defer until measured.

---

### M5. Missing index on `probeStatus` for both `videos` and `cuts`

**Location:** [schema.ts:68, :103](src/main/framework-drivers/database/schema.ts) — neither `videos` nor `cuts` has an index on `probe_status`.

**Cost at baseline:** [EnrichMediaMetadata.execute](src/main/use-cases/EnrichMediaMetadata.ts:24) calls `videoRepo.findByProbeStatus('pending')` and `cutRepo.findByProbeStatus('pending')` on every reconcile flush + on startup. With 5K mostly-`complete` rows, the predicate matches few but SQLite still has to scan 5K to decide. ~5ms per call.

Not a blocker — full scans on 5K rows in SQLite are sub-10ms — but adding an index is a 1-line schema change and makes the post-reconcile fan-out essentially free.

**Recommendation:** add `idx_videos_probe_status` on `videos.probeStatus` and `idx_cuts_probe_status` on `cuts.probeStatus`. Next migration. Combine with M-anything if we ship a schema bump.

---

## LOW

### L1. `findPaginated` issues two separate scans (`COUNT(*)` then page) per page request

**Location:** every `findPaginated` in [SqliteCreatorRepository.ts:126](src/main/interface-adapters/repositories/SqliteCreatorRepository.ts), [SqliteVideoRepository.ts:223](src/main/interface-adapters/repositories/SqliteVideoRepository.ts), [SqliteCutRepository.ts:269](src/main/interface-adapters/repositories/SqliteCutRepository.ts).

**Cost at baseline:** two queries per page render. With only the `status` filter, the `COUNT(*)` uses the status index and is fast; with `LIKE` search (see L2) the count itself becomes a full scan. At 5K + LIKE, ~30–50ms per page.

**Recommendation:** acceptable as-is. The cleanest optimization (`COUNT(*) OVER ()` window function inside the page query) doubles row size and adds complexity. Defer until measured.

---

### L2. `LIKE '%search%'` has no FTS index — full scan on every search keystroke

**Location:** [SqliteCreatorRepository.ts:115–119, SqliteVideoRepository.ts:212–216, SqliteCutRepository.ts:251–253](src/main/interface-adapters/repositories/).

**Cost at baseline:** at 5K rows, a `LIKE '%foo%'` scan is ~10–20ms. Combined with the renderer debouncing search input (TanStack Query default 0ms — does the search input itself debounce?), this could fire many queries while the user types.

**Recommendation:** verify the search input is debounced in the renderer (CreatorFilters / VideoFilters). If yes, leave alone. If no, add a 250ms debounce. Adding SQLite FTS5 is a future option but overkill at 5K.

---

### L3. Creator name sort is unindexed

**Location:** [schema.ts:26–29](src/main/framework-drivers/database/schema.ts) — only `status` and `youtubeChannelId` are indexed on `creators`. `findAll` and `findAllActive` use `ORDER BY name` and incur a full sort.

**Cost at baseline:** sorting 100 strings is ~0.1ms. Even at 1000 creators, < 5ms.

**Recommendation:** no action. Add `idx_creators_name` only if creator counts grow past 10K.

---

### L4. `useDbListener` invalidates 6 query trees on every push; rapid bursts could cause invalidation storm

**Location:** [src/renderer/hooks/use-db-listener.ts:15–22](src/renderer/hooks/use-db-listener.ts).

**Cost at baseline:** the `db-updated` event is fired at well-defined points (end of reconcile, end of migrate, end of EnrichAllVideos batch, etc.) — not in the inner loop. So bursts are rare in practice. TanStack Query also coalesces invalidations within the same tick.

**Recommendation:** no action. Worth revisiting only if a future feature starts firing `db-updated` from inside a loop.

---

### L5. `MediaCard` allocates the card JSX even when `children` is provided and the card is discarded

**Location:** [MediaCard.tsx:38–78](src/renderer/components/shared/MediaCard.tsx).

```tsx
const card = (...)  // expensive JSX tree
return children ? <>{children}</> : card
```

If a caller passes `children`, the `card` JSX is built and thrown away. None of the current callers actually pass `children` (they wrap MediaCard in `EntityContextMenu`, not the other way around), so the dead branch never fires — but the unused-allocation pattern is brittle and slightly wasteful when it does.

**Cost at baseline:** none today. Possibly a logic bug-in-waiting.

**Recommendation:** delete the `children` prop and the `children ? ... : card` branch. The compose-via-wrapping pattern (`<ContextMenu><MediaCard /></ContextMenu>`) is what the codebase actually uses.

---

## Surfaces with no findings

- **Surface 4 — EnrichAllVideos.** Throughput is bound by yt-dlp's per-video latency (2–5s) and the deliberate concurrency-1 rate-limit. Our code overhead is negligible. Memory of 5K × Video objects is ~5MB, fine. Checkpointing works — `findNeedingDetail` filters by `detailFetchedAt IS NULL` so a kill-and-restart resumes correctly.
- **Surface 8 — CommentsTab.** `groupThreads` and `replyCount` are properly memoized with stable `data` deps. `buildClipboardText` runs only on Copy click. Nothing to fix.

---

## Summary

| Severity | Count | Theme                                                                                                                                                                        |
| -------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HIGH     | 0     | —                                                                                                                                                                            |
| MEDIUM   | 5     | M1: redundant SELECT in audit decorator. M2: N+1 in Reconcile. M3: per-creator transactions in granular. M4: unindexed sort columns exposed. M5: missing probe_status index. |
| LOW      | 5     | L1–L4: defer until measured. L5: dead code in MediaCard.                                                                                                                     |

**Recommended fix sequencing (if all approved):**

1. **M1 + M2 together** — same file ([ReconcileDirectory.ts](src/main/use-cases/ReconcileDirectory.ts)) + audited-repo signature change. Highest cumulative impact (~200ms saved on startup at 5K). Best ROI.
2. **M5** — schema migration + `pushSchema()` update. Small, isolated.
3. **L5** — delete dead code in MediaCard. Trivial.
4. **M3** — restructure `processGranular` to one outer transaction. Worth doing but lower urgency.
5. **M4 / L1–L4** — defer. Revisit only if real-world measurement shows pain.

**Total estimated improvement at 5K baseline if M1+M2+M5 land:** Reconcile-on-startup time drops ~250ms (50ms M1 + 150ms M2 + 5ms M5 × multiple calls). Not life-changing for a single user, but it's also free leverage and the code becomes simpler.

**Next step:** triage with the user. For each finding, mark `fix / defer / reject`. After fix pass, audit file is removable.
