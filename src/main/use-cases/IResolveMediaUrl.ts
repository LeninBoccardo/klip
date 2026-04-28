/**
 * Kinds of entities that can serve a media asset over the `klip-media://` protocol.
 *
 * The renderer only ever holds an entity-id reference; the main process resolves
 * `(kind, id, asset)` to a canonical filesystem path via the index, never trusting
 * a renderer-supplied path directly.
 */
export type MediaKind = 'video' | 'cut' | 'creator'

/**
 * Asset slots a `MediaKind` can serve. Not every (kind, asset) pair is valid —
 * `creator` only exposes `'avatar'`, while `video` and `cut` expose `'file'`
 * and `'thumbnail'`. Invalid pairs resolve to `null`.
 */
export type MediaAsset = 'file' | 'thumbnail' | 'avatar'

export interface ResolveMediaUrlInput {
  kind: MediaKind
  id: string
  asset: MediaAsset
}

/**
 * Maps an entity-keyed media reference to a canonical filesystem path.
 *
 * Returns `null` when:
 *   - the entity does not exist
 *   - the entity exists but the requested asset slot is empty
 *     (e.g. `thumbnailPath === null`, `profileImagePath === null`)
 *   - the (kind, asset) pair is invalid (e.g. `creator/file`)
 *
 * Existence on disk is *not* asserted here — the protocol handler performs
 * the realpath / containment check on the returned path as a defence-in-depth
 * second gate.
 */
export interface IResolveMediaUrl {
  resolve(input: ResolveMediaUrlInput): string | null
}
