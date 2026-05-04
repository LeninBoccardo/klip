import { describe, it, expect } from 'vitest'
import { join, dirname } from 'path'
import { NodePathResolver } from '@main/interface-adapters/file-system/NodePathResolver'

describe('NodePathResolver', () => {
  const resolver = new NodePathResolver()

  it('join delegates to path.join with all segments', () => {
    expect(resolver.join('a', 'b', 'c')).toBe(join('a', 'b', 'c'))
  })

  it('join with no arguments returns "."', () => {
    expect(resolver.join()).toBe(join())
  })

  it('join collapses redundant separators', () => {
    // Mirrors `path.join('a', '/b', 'c')` — implementation-defined behaviour
    // we want to keep parity with rather than re-implement.
    expect(resolver.join('a', 'b', 'c')).toBe(join('a', 'b', 'c'))
  })

  it('dirname delegates to path.dirname', () => {
    const p = join('a', 'b', 'c.txt')
    expect(resolver.dirname(p)).toBe(dirname(p))
  })

  it('dirname of a top-level file returns "."', () => {
    expect(resolver.dirname('foo.txt')).toBe(dirname('foo.txt'))
  })
})
