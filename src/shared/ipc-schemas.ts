import { z } from 'zod'
import type { InvokeChannel } from './ipc-contract'

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

const paginationParamsSchema = z.object({
  page: z.number(),
  pageSize: z.number(),
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
  'fetch-video-info': z.tuple([z.string()]),
  'download-video': z.tuple([z.string(), z.string()]),
  'cancel-download': z.tuple([z.string()]),
  'probe-media-file': z.tuple([z.string()]),
  'fetch-channel-info': z.tuple([z.string()]),

  // ── Creators ──
  'get-creators-paginated': z.tuple([paginationParamsSchema]),
  'get-creator-by-id': z.tuple([z.string()]),
  'delete-creator': z.tuple([z.string()]),
  'restore-creator': z.tuple([z.string()]),

  // ── Videos ──
  'get-videos-paginated': z.tuple([videoQueryParamsSchema]),
  'get-video-by-id': z.tuple([z.string()]),
  'delete-video': z.tuple([z.string()]),
  'restore-video': z.tuple([z.string()]),
  'fetch-video-detail': z.tuple([z.string()]),
  'enrich-all-videos': z.tuple([]),
  'get-transcript': z.tuple([z.string()]),
  // `maxComments` is optional in the contract; renderer always passes it
  // (default 500 in the hook), but accept either arity to stay forward-
  // compatible with future call sites.
  'fetch-video-comments': z.union([z.tuple([z.string()]), z.tuple([z.string(), z.number()])]),

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
  // exhaust the use case (default and per-surface caps applied there).
  'search-all': z.union([z.tuple([z.string()]), z.tuple([z.string(), z.number()])]),

  // ── Shell ──
  // Kind allowlist mirrors the contract; the controller maps these to
  // ResolveMediaUrl(kind, id, asset='file').
  'open-media-externally': z.tuple([z.enum(['video', 'cut']), z.string().min(1)]),

  // ── Tags ──
  'get-all-distinct-tags': z.tuple([]),
  'bulk-update-tags': z.tuple([bulkUpdateTagsRequestSchema]),
  'rename-tag-globally': z.tuple([tagSchema, tagSchema]),

  // ── Settings ──
  'get-settings': z.tuple([]),
  'get-setting': z.tuple([z.string()]),
  'set-setting': z.tuple([z.string(), z.string()]),
  'migrate-root': z.tuple([z.string()]),
  'select-folder': z.tuple([]),

  // ── Audit Log ──
  'get-audit-log-by-entity': z.tuple([z.string(), z.string()]),
  'get-audit-log-recent': z.tuple([z.number()]),

  // ── Operations ──
  'get-operation-by-id': z.tuple([z.string()]),
  'get-operations-by-status': z.tuple([z.string()]),

  // ── Updater ──
  'check-for-updates': z.tuple([]),
  'install-update': z.tuple([]),
  'get-updater-status': z.tuple([])
} as const satisfies Record<InvokeChannel, z.ZodTypeAny>

export type IpcSchemaFor<C extends InvokeChannel> = (typeof ipcSchemas)[C]
