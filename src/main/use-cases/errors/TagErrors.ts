/**
 * Typed errors for tag-mutation use cases.
 *
 * `name` is preserved across Electron's IPC structured clone, so the renderer
 * can pattern-match on `err.name` to render the right toast/affordance —
 * matching the same convention used in `RegisterCreatorErrors.ts`.
 */

export const TAG_ERROR = {
  emptyOldTag: 'EMPTY_OLD_TAG',
  emptyNewTag: 'EMPTY_NEW_TAG',
  emptyTagOps: 'EMPTY_TAG_OPS'
} as const

export class EmptyOldTagError extends Error {
  readonly name = 'EmptyOldTagError'
  constructor() {
    super(TAG_ERROR.emptyOldTag)
  }
}

export class EmptyNewTagError extends Error {
  readonly name = 'EmptyNewTagError'
  constructor() {
    super(TAG_ERROR.emptyNewTag)
  }
}

/**
 * Both `addTags` and `removeTags` were empty in a BulkUpdateTags request —
 * no work to do, but signal the empty payload to the caller as a typed error
 * (the IPC schema also rejects this, but the use case is callable from main
 * code paths that don't go through IPC).
 */
export class EmptyTagOperationsError extends Error {
  readonly name = 'EmptyTagOperationsError'
  constructor() {
    super(TAG_ERROR.emptyTagOps)
  }
}
