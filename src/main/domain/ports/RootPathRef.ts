/**
 * Mutable reference to the current root path.
 * Shared across use cases and controllers so that root migration
 * updates are visible to all consumers immediately.
 */
export interface RootPathRef {
  value: string
}

