import { describe, it, expect } from 'vitest'
import { classifyAction, classifyEntity, entityHref } from '@/lib/audit-format'
import type { AuditEntryDto } from '@shared/dtos'

function makeEntry(overrides: Partial<AuditEntryDto> = {}): AuditEntryDto {
  return {
    id: 1,
    entityType: 'video',
    entityId: 'v-1',
    action: 'created',
    changes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

describe('classifyEntity', () => {
  it('returns the known entity kind verbatim', () => {
    expect(classifyEntity('creator')).toBe('creator')
    expect(classifyEntity('video')).toBe('video')
    expect(classifyEntity('cut')).toBe('cut')
    expect(classifyEntity('collection')).toBe('collection')
  })

  it('falls back to "unknown" for unrecognised types', () => {
    expect(classifyEntity('mystery')).toBe('unknown')
    expect(classifyEntity('')).toBe('unknown')
  })
})

describe('classifyAction', () => {
  it('returns the known action verbatim', () => {
    expect(classifyAction('created')).toBe('created')
    expect(classifyAction('cascade_deleted')).toBe('cascade_deleted')
    expect(classifyAction('reordered')).toBe('reordered')
  })

  it('falls back to "unknown" for unrecognised actions', () => {
    expect(classifyAction('exploded')).toBe('unknown')
  })
})

describe('entityHref', () => {
  it('builds creator detail URL', () => {
    expect(entityHref(makeEntry({ entityType: 'creator', entityId: 'mrbeast' }))).toBe(
      '/creators/mrbeast'
    )
  })

  it('builds video detail URL', () => {
    expect(entityHref(makeEntry({ entityType: 'video', entityId: 'abc-123' }))).toBe(
      '/videos/abc-123'
    )
  })

  it('routes cuts to the dedicated /cuts list (no per-cut detail route yet)', () => {
    expect(entityHref(makeEntry({ entityType: 'cut', entityId: 'cut-1' }))).toBe('/cuts')
  })

  it('builds collection detail URL', () => {
    expect(entityHref(makeEntry({ entityType: 'collection', entityId: 'col-1' }))).toBe(
      '/collections/col-1'
    )
  })

  it('returns null for unknown entity types', () => {
    expect(entityHref(makeEntry({ entityType: 'mystery' }))).toBeNull()
  })
})
