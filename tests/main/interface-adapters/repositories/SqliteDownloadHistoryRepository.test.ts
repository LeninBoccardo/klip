import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb } from '../../helpers/createTestDb'
import type { DatabaseInstance } from '@main/framework-drivers/database'
import { SqliteDownloadHistoryRepository } from '@main/interface-adapters/repositories/SqliteDownloadHistoryRepository'
import type { DownloadHistoryEntry } from '@domain/entities'

function makeEntry(overrides: Partial<DownloadHistoryEntry> = {}): DownloadHistoryEntry {
  return {
    id: 'dh-1',
    youtubeUrl: 'https://youtube.com/watch?v=abc',
    videoId: 'abc',
    videoTitle: 'Test',
    thumbnailUrl: null,
    creatorFolderName: 'creator',
    status: 'success',
    errorMessage: null,
    errorRetryable: false,
    finishedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

// Regression for F07/F08: pushSchema() (the :memory: schema builder used by
// createTestDb) omitted the download_history table, so any repository test
// against it threw "no such table: download_history" and the finished-downloads
// feature could not be tested in-memory at all. The table is now mirrored from
// migration 0011 in pushSchema, so this whole suite is what would have been
// impossible before the fix.
describe('SqliteDownloadHistoryRepository (in-memory schema parity, F07/F08)', () => {
  let database: DatabaseInstance
  let repo: SqliteDownloadHistoryRepository

  beforeEach(() => {
    database = createTestDb()
    repo = new SqliteDownloadHistoryRepository(database.db)
  })

  afterEach(() => {
    database.raw.close()
  })

  it('append + findRecent round-trips against the pushSchema :memory: DB', () => {
    expect(() => repo.append(makeEntry())).not.toThrow()
    const recent = repo.findRecent(10)
    expect(recent).toHaveLength(1)
    expect(recent[0]).toMatchObject({
      id: 'dh-1',
      status: 'success',
      creatorFolderName: 'creator',
      errorRetryable: false
    })
  })

  it('orders findRecent by finishedAt desc and respects the limit', () => {
    repo.append(makeEntry({ id: 'old', finishedAt: '2026-01-01T00:00:00.000Z' }))
    repo.append(makeEntry({ id: 'new', finishedAt: '2026-02-01T00:00:00.000Z' }))
    expect(repo.findRecent(1).map((r) => r.id)).toEqual(['new'])
  })

  it('deleteOlderThan removes rows below the cutoff', () => {
    repo.append(makeEntry({ id: 'old', finishedAt: '2026-01-01T00:00:00.000Z' }))
    repo.append(makeEntry({ id: 'keep', finishedAt: '2026-03-01T00:00:00.000Z' }))
    expect(repo.deleteOlderThan('2026-02-01T00:00:00.000Z')).toBe(1)
    expect(repo.findById('old')).toBeNull()
    expect(repo.findById('keep')).not.toBeNull()
  })
})
