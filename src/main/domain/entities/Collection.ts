/** A user-curated, ordered list that can hold videos and cuts together. */
export type CollectionKind = 'manual' | 'smart'

export interface Collection {
  id: string
  name: string
  description: string | null
  /**
   * 'manual' for v1 — items are added explicitly and reordered by drag.
   * 'smart' is reserved for a future saved-query collection type.
   */
  kind: CollectionKind
  /** JSON-encoded smart query; null for manual collections. */
  smartQuery: string | null
  createdAt: string
  updatedAt: string
}

/** A reference to one entry in a collection, returned by `getItems`. */
export interface CollectionItem {
  kind: 'video' | 'cut'
  id: string
  position: number
  addedAt: string
}
