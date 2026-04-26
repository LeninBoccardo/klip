import { join, dirname } from 'path'
import type { IPathResolver } from '@domain/ports'

/**
 * Node.js `path`-backed implementation of `IPathResolver`.
 */
export class NodePathResolver implements IPathResolver {
  join(...segments: string[]): string {
    return join(...segments)
  }

  dirname(p: string): string {
    return dirname(p)
  }
}
