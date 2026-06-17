import { z } from 'zod'
import type { InvokeChannel } from './ipc-contract'
import { renderCutRequestSchema } from './types'

/**
 * Runtime schemas for every invoke-channel's parameter tuple.
 *
 * `IpcContract` provides compile-time safety for legitimate callers. Under our
 * threat model, a renderer compromised through stored YouTube content (XSS in
 * a comment / metadata field that bypasses React's escaping, or a future
 * dangerouslySetInnerHTML site) can invoke `window.api.*` channels with
 * arbitrary payloads. zod parsing at the handler boundary turns that into a
 * typed error rather than letting a malformed payload reach a use-case where
 * an `OOM` (`pageSize: 1e9`) or `path.join('..', '..', 'x')` would be
 * evaluated against the user's filesystem.
 *
 * Maintenance: every entry must remain in sync with `IpcContract`. The
 * `satisfies Record<InvokeChannel, z.ZodTypeAny>` clause below catches a new
 * channel added to the contract without a schema (compile error), and the
 * `Object.keys(ipcSchemas)` runtime check inside `createTypedHandler` catches
 * the inverse — a controller registers a channel that has no schema.
 */
const entityStatusSchema = z.enum(['active', 'deleted', 'missing'])

// Numeric bounds defend against renderer-XSS-driven DoS: a `pageSize: 1e9`
// on an unindexed query is a memory amplification primitive. UI never asks
// for >100 items; the 500 cap leaves slack for future bulk views.
const paginationParamsSchema = z.object({
  page: z.int().min(1).max(1_000_000),
  pageSize: z.int().min(1).max(500),
  sortBy: z.string().optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
  search: z.string().optional(),
  status: z.array(entityStatusSchema).optional()
})

const videoQueryParamsSchema = paginationParamsSchema.extend({
  creatorId: z.string().optional()
})

const cutQueryParamsSchema = paginationParamsSchema.extend({
  creatorId: z.string().optional(),
  videoId: z.string().optional(),
  tags: z.array(z.string()).optional()
})

// Cap incoming arrays to defend the use-case against accidental DoS via a
// renderer XSS that drives an oversized batch. 5K matches the documented
// scaling baseline (audit 03) and is well above any legitimate UI selection.
const tagSchema = z.string().min(1).max(64)
const idArraySchema = z.array(z.string().min(1)).max(5000)
const tagArraySchema = z.array(tagSchema).max(64)

// A renderer-supplied URL bound for a yt-dlp spawn. Beyond URL-shape validation
// it must be http(s): a `file:` / `javascript:` URL — or a leading-dash value
// yt-dlp would parse as an option (`--exec=…` → arbitrary command execution) —
// has no legitimate use here. Defence-in-depth alongside the `--` end-of-options
// terminator inserted before every URL positional in YtDlpDownloader.
const ytDlpUrlSchema = z
  .string()
  .url()
  .max(4096)
  .refine((u) => /^https?:\/\//i.test(u), { message: 'URL must use http(s)' })

const channelInfoSchema = z.object({
  channelId: z.string(),
  channelName: z.string(),
  channelUrl: z.string().nullable(),
  uploaderUrl: z.string().nullable(),
  subscriberCount: z.number().nullable(),
  avatarUrl: z.string().nullable()
})

const registerCreatorRequestSchema = z.object({
  channelInfo: channelInfoSchema,
  displayName: z.string().min(1).max(200),
  folderName: z.string().min(1).max(200),
  notes: z.string().max(5000).nullable(),
  // Tags get re-normalized in the use case; the cap here matches tagArraySchema
  // and protects the use case from oversized payloads.
  tags: z.array(z.string().max(64)).max(64)
})

const bulkUpdateTagsRequestSchema = z
  .object({
    entityKind: z.enum(['video', 'cut']),
    ids: idArraySchema,
    addTags: tagArraySchema.optional(),
    removeTags: tagArraySchema.optional()
  })
  .refine(
    (req) =>
      (req.addTags && req.addTags.length > 0) || (req.removeTags && req.removeTags.length > 0),
    { message: 'addTags and removeTags cannot both be empty' }
  )

export const ipcSchemas = {
  // ── Reconcile / Download / Probe ──
  reconcile: z.tuple([]),
  'fetch-video-info': z.tuple([ytDlpUrlSchema]),
  'download-video': z.tuple([ytDlpUrlSchema, z.string().min(1).max(200)]),
  'cancel-download': z.tuple([z.string()]),
  'probe-media-file': z.tuple([z.string()]),
  'fetch-channel-info': z.tuple([ytDlpUrlSchema]),

  // ── Creators ──
  'get-creators-paginated': z.tuple([paginationParamsSchema]),
  'get-creator-by-id': z.tuple([z.string()]),
  'delete-creator': z.tuple([z.string()]),
  'restore-creator': z.tuple([z.string()]),
  'register-creator': z.tuple([registerCreatorRequestSchema]),
  'refresh-creator-avatar': z.tuple([z.string()]),

  // ── Videos ──
  'get-videos-paginated': z.tuple([videoQueryParamsSchema]),
  'get-video-by-id': z.tuple([z.string()]),
  'delete-video': z.tuple([z.string()]),
  'restore-video': z.tuple([z.string()]),
  'fetch-video-detail': z.tuple([z.string()]),
  'enrich-all-videos': z.tuple([]),
  'get-transcript': z.tuple([z.string()]),
  'get-transcript-segments': z.tuple([z.string()]),
  // `maxComments` is optional in the contract; renderer always passes it
  // (default 500 in the hook), but accept either arity to stay forward-
  // compatible with future call sites. The cap (50000) protects yt-dlp
  // from an XSS-driven `Infinity` that would scrape millions of comments
  // while holding the spawn timeout open. The renderer's "Fetch all"
  // action targets the cap directly; yt-dlp's own scraping rate-limits
  // (and the dynamic timeout in fetchComments) keep individual runs
  // bounded even for the highest-volume videos.
  'fetch-video-comments': z.union([
    z.tuple([z.string()]),
    z.tuple([z.string(), z.int().min(1).max(50_000)])
  ]),
  // Cache-only sibling: returns the on-disk cached comments payload for a
  // video (7-day TTL) or null. Does NOT call yt-dlp. Renderer hits this on
  // tab open so previously-fetched comments survive route/tab changes.
  'get-cached-video-comments': z.tuple([z.string()]),
  'move-videos-to-creator': z.tuple([
    z.object({
      // Same 5K cap as bulk-update-tags — protects the use case from XSS-driven
      // oversized batches; matches the documented scaling baseline (audit 03).
      videoIds: z.array(z.string().min(1)).min(1).max(5000),
      targetCreatorId: z.string().min(1).max(200)
    })
  ]),

  // ── Cuts ──
  'get-cuts-paginated': z.tuple([cutQueryParamsSchema]),
  'get-cut-by-id': z.tuple([z.string()]),
  'get-cuts-by-tags': z.tuple([z.array(z.string())]),
  'delete-cut': z.tuple([z.string()]),
  'restore-cut': z.tuple([z.string()]),

  // ── Collections ──
  // Caps mirror the bulk-tag precedent: `name` ≤ 200 chars (UI input limit
  // is 100), `description` ≤ 5000, item arrays ≤ 5000 elements (above any
  // realistic playlist size). XSS-driven payloads that exceed these reject
  // before reaching the use case.
  'collections-paginated': z.tuple([paginationParamsSchema]),
  'collection-by-id': z.tuple([z.string().min(1)]),
  'collection-get-items': z.tuple([z.string().min(1)]),
  'collection-create': z.tuple([
    z.object({
      name: z.string().min(1).max(200),
      description: z.string().max(5000).nullish()
    })
  ]),
  'collection-rename': z.tuple([
    z.object({
      id: z.string().min(1),
      name: z.string().min(1).max(200),
      description: z.string().max(5000).nullish()
    })
  ]),
  'collection-delete': z.tuple([z.string().min(1)]),
  'collection-add-item': z.tuple([
    z.object({
      collectionId: z.string().min(1),
      kind: z.enum(['video', 'cut']),
      id: z.string().min(1)
    })
  ]),
  'collection-remove-item': z.tuple([
    z.object({
      collectionId: z.string().min(1),
      kind: z.enum(['video', 'cut']),
      id: z.string().min(1)
    })
  ]),
  'collection-reorder': z.tuple([
    z.object({
      collectionId: z.string().min(1),
      items: z
        .array(
          z.object({
            kind: z.enum(['video', 'cut']),
            id: z.string().min(1)
          })
        )
        .max(5000)
    })
  ]),

  // ── Search ──
  // Optional `limit` passes through; an XSS-driven payload that drops it can't
  // exhaust the use case (default and per-surface caps applied there). The
  // explicit 100 cap matches the UI command-palette ceiling.
  'search-all': z.union([z.tuple([z.string()]), z.tuple([z.string(), z.int().min(1).max(100)])]),
  'search-transcripts': z.tuple([
    z.object({
      // 1024 chars covers any plausible search and stops a renderer-XSS payload
      // that builds a giant FTS phrase from blowing up the matcher.
      query: z.string().max(1024),
      limit: z.int().min(1).max(200),
      offset: z.int().min(0).max(100_000)
    })
  ]),

  // ── Shell ──
  // Kind allowlist mirrors the contract; the controller maps these to
  // ResolveMediaUrl(kind, id, asset='file').
  'open-media-externally': z.tuple([z.enum(['video', 'cut']), z.string().min(1)]),
  // Path bounded to defend the use-case from oversized payloads; the
  // controller additionally validates containment under rootPath.
  'open-path-in-shell': z.tuple([z.string().min(1).max(4096)]),
  'open-log-folder': z.tuple([]),
  // Bounded URL: 4096 chars covers any reasonable youtube link. Host
  // allowlist enforced in the controller, not here, so the schema layer
  // stays generic.
  'open-external-url': z.tuple([z.string().url().max(4096)]),
  // Mirrors `open-media-externally` shape; controller resolves through
  // `IResolveMediaUrl` and shows the canonical path in the OS file manager.
  'reveal-entity-in-folder': z.tuple([z.enum(['video', 'cut']), z.string().min(1)]),
  'reveal-creator-folder': z.tuple([z.string().min(1)]),

  // ── Stats ──
  'get-storage-stats': z.tuple([]),
  'get-library-stats': z.tuple([]),

  // ── Tags ──
  'get-all-distinct-tags': z.tuple([]),
  'bulk-update-tags': z.tuple([bulkUpdateTagsRequestSchema]),
  'rename-tag-globally': z.tuple([tagSchema, tagSchema]),
  'delete-tag-globally': z.tuple([tagSchema]),

  // ── Settings ──
  'get-settings': z.tuple([]),
  'get-setting': z.tuple([z.string()]),
  'set-setting': z.tuple([z.string(), z.string()]),
  'migrate-root': z.tuple([z.string()]),
  'select-folder': z.tuple([]),

  // ── Audit Log ──
  'get-audit-log-by-entity': z.tuple([z.string(), z.string()]),
  // `recent` is a row count; cap matches the largest UI list size we'd ever
  // render (the audit-log dashboard paginates anything bigger).
  'get-audit-log-recent': z.tuple([z.int().min(1).max(10_000)]),

  // ── Operations ──
  'get-operation-by-id': z.tuple([z.string()]),
  'get-operations-by-status': z.tuple([z.string()]),

  // ── Download history ──
  // limit caps the renderer's payload size; 500 is well above the realistic
  // visible page and matches the existing pagination ceiling.
  'list-download-history': z.tuple([z.int().min(1).max(500)]),
  'retry-download': z.tuple([z.string().min(1)]),

  // ── Updater ──
  'check-for-updates': z.tuple([]),
  'install-update': z.tuple([]),
  'get-updater-status': z.tuple([]),

  // ── Editor (in-app trim) ──
  // The editor window URL embeds sourceVideoId in its hash, but the IPC
  // entry from the main window sends the same id through here so the
  // window-manager can validate + resolve it before window creation.
  'editor-open-window': z.tuple([z.object({ sourceVideoId: z.string().min(1).max(256) })]),
  // The full recipe is validated through `renderCutRequestSchema` —
  // unknown op types fail closed at the boundary instead of reaching
  // the use-case (defence-in-depth + the forward-compat sentinel).
  'editor-start-render': z.tuple([renderCutRequestSchema]),
  'editor-cancel-render': z.tuple([z.string().min(1).max(256)]),
  'editor-get-session': z.tuple([z.string().min(1).max(256)]),
  'editor-find-session-by-source': z.tuple([z.string().min(1).max(256)])
} as const satisfies Record<InvokeChannel, z.ZodTypeAny>

export type IpcSchemaFor<C extends InvokeChannel> = (typeof ipcSchemas)[C]
