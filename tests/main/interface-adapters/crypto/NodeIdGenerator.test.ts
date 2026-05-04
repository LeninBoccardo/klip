import { describe, it, expect } from 'vitest'
import { NodeIdGenerator } from '@main/interface-adapters/crypto/NodeIdGenerator'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

describe('NodeIdGenerator', () => {
  const gen = new NodeIdGenerator()

  it('generates a UUID-shaped string', () => {
    expect(gen.generate()).toMatch(UUID_RE)
  })

  it('generates a unique value across many calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => gen.generate()))
    expect(ids.size).toBe(100)
  })
})
