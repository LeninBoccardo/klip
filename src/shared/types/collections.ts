/** Which entity table a collection-item operation targets. */
export type CollectionItemKind = 'video' | 'cut'

export interface CreateCollectionRequest {
  name: string
  description?: string | null
}

export interface RenameCollectionRequest {
  id: string
  name: string
  description?: string | null
}

export interface AddToCollectionRequest {
  collectionId: string
  kind: CollectionItemKind
  id: string
}

export interface RemoveFromCollectionRequest {
  collectionId: string
  kind: CollectionItemKind
  id: string
}

/**
 * Input for `ReorderCollection`. The caller passes the desired final order
 * — every item currently in the collection must appear exactly once. The
 * use case rejects partial reorders (it cannot know whether a missing entry
 * is intentional or a bug).
 */
export interface ReorderCollectionRequest {
  collectionId: string
  items: Array<{ kind: CollectionItemKind; id: string }>
}

export interface AddToCollectionResult {
  position: number
}
