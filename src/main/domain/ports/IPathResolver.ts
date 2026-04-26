/**
 * Abstraction over path-manipulation operations.
 * Used by use-cases to avoid direct `import { join } from 'path'` dependency.
 */
export interface IPathResolver {
  /** Join path segments into a single path string */
  join(...segments: string[]): string

  /** Return the directory portion of a path (e.g. "/a/b/c.mp4" → "/a/b") */
  dirname(path: string): string
}
