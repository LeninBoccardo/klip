import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteSettingsRepository } from '@main/interface-adapters/repositories'
import type { DatabaseInstance } from '@main/framework-drivers/database'
import { createTestDb } from '../../helpers/createTestDb'

describe('SqliteSettingsRepository', () => {
  let database: DatabaseInstance
  let repo: SqliteSettingsRepository

  beforeEach(() => {
    database = createTestDb()
    repo = new SqliteSettingsRepository(database.db)
  })

  afterEach(() => {
    database.raw.close()
  })

  // ── get ──

  it('returns null for a non-existent key', () => {
    expect(repo.get('missing-key')).toBeNull()
  })

  it('returns the value for an existing key', () => {
    repo.set('rootPath', '/home/user/klip')
    expect(repo.get('rootPath')).toBe('/home/user/klip')
  })

  // ── set ──

  it('inserts a new key-value pair', () => {
    repo.set('theme', 'dark')
    expect(repo.get('theme')).toBe('dark')
  })

  it('updates an existing key (upsert)', () => {
    repo.set('rootPath', '/old/path')
    repo.set('rootPath', '/new/path')
    expect(repo.get('rootPath')).toBe('/new/path')
  })

  it('handles empty string values', () => {
    repo.set('emptyVal', '')
    expect(repo.get('emptyVal')).toBe('')
  })

  it('handles values with special characters', () => {
    repo.set('path', 'C:\\Users\\name\\Documents\\klip')
    expect(repo.get('path')).toBe('C:\\Users\\name\\Documents\\klip')
  })

  // ── getAll ──

  it('returns an empty object when no settings exist', () => {
    expect(repo.getAll()).toEqual({})
  })

  it('returns all settings as a key-value record', () => {
    repo.set('rootPath', '/home/user/klip')
    repo.set('theme', 'dark')
    repo.set('language', 'en')

    const all = repo.getAll()
    expect(all).toEqual({
      rootPath: '/home/user/klip',
      theme: 'dark',
      language: 'en'
    })
  })

  it('getAll reflects upserted values', () => {
    repo.set('key', 'v1')
    repo.set('key', 'v2')

    const all = repo.getAll()
    expect(Object.keys(all)).toHaveLength(1)
    expect(all.key).toBe('v2')
  })
})
