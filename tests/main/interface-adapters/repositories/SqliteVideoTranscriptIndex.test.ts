import { describe, it, expect, beforeEach } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { initializeDatabase } from '@main/framework-drivers/database'
import { SqliteVideoTranscriptIndex } from '@main/interface-adapters/repositories/SqliteVideoTranscriptIndex'
import { buildFtsPhraseQuery } from '@main/interface-adapters/repositories/SqliteVideoTranscriptIndex'

function seedVideo(
  raw: BetterSqlite3.Database,
  id: string,
  title: string,
  transcript: string | null,
  status: 'active' | 'deleted' = 'active'
): void {
  raw.exec(
    `INSERT INTO creators (id, folder_name, name) VALUES ('c-1', 'c-1', 'C') ON CONFLICT DO NOTHING`
  )
  const stmt = raw.prepare(
    `INSERT INTO videos (id, creator_id, title, file_path, transcript_text, status)
     VALUES (?, 'c-1', ?, ?, ?, ?)`
  )
  stmt.run(id, title, `/p/${id}.mp4`, transcript, status)
}

describe('buildFtsPhraseQuery', () => {
  it('wraps non-empty input in double quotes', () => {
    expect(buildFtsPhraseQuery('hello world')).toBe('"hello world"')
  })

  it('doubles internal double-quotes (FTS5 escape convention)', () => {
    expect(buildFtsPhraseQuery('say "hi"')).toBe('"say ""hi"""')
  })

  it('returns null for empty / whitespace input', () => {
    expect(buildFtsPhraseQuery('')).toBeNull()
    expect(buildFtsPhraseQuery('   ')).toBeNull()
  })

  it('strips outer whitespace before wrapping', () => {
    expect(buildFtsPhraseQuery('  hi  ')).toBe('"hi"')
  })
})

describe('SqliteVideoTranscriptIndex', () => {
  let raw: BetterSqlite3.Database
  let index: SqliteVideoTranscriptIndex

  beforeEach(() => {
    const { raw: instance } = initializeDatabase(':memory:')
    raw = instance
    index = new SqliteVideoTranscriptIndex(raw)
  })

  it('returns empty array for empty query', () => {
    seedVideo(raw, 'v-1', 'Hello', 'world hello')
    expect(index.search('', 10, 0)).toEqual([])
  })

  it('finds a video by transcript text and includes a snippet with markers', () => {
    seedVideo(raw, 'v-1', 'Random title', 'we love bicycles in the morning')
    const hits = index.search('bicycles', 10, 0)
    expect(hits).toHaveLength(1)
    expect(hits[0].videoId).toBe('v-1')
    expect(hits[0].snippet).toContain('<<<bicycles>>>')
  })

  it('does not return videos whose status is not active', () => {
    seedVideo(raw, 'v-1', 'Soft delete', 'bicycles', 'deleted')
    expect(index.search('bicycles', 10, 0)).toEqual([])
  })

  it('finds title-only matches with snippet=null', () => {
    seedVideo(raw, 'v-1', 'Bicycles 101', null)
    const hits = index.search('Bicycles', 10, 0)
    expect(hits).toHaveLength(1)
    expect(hits[0].snippet).toBeNull()
  })

  it('countApproximate returns 0 for empty query', () => {
    seedVideo(raw, 'v-1', 'Title', 'foo bar')
    expect(index.countApproximate('', 100)).toBe(0)
  })

  it('countApproximate returns the match count up to the cap', () => {
    for (let i = 0; i < 5; i++) seedVideo(raw, `v-${i}`, `T-${i}`, 'bicycles')
    expect(index.countApproximate('bicycles', 100)).toBe(5)
    expect(index.countApproximate('bicycles', 3)).toBe(3)
  })

  it('findVideosNeedingBackfill returns rows with transcript_path but no transcript_text', () => {
    raw.exec(`INSERT INTO creators (id, folder_name, name) VALUES ('c-1', 'c-1', 'C')`)
    const stmt = raw.prepare(
      `INSERT INTO videos (id, creator_id, title, file_path, transcript_path, transcript_text, status)
       VALUES (?, 'c-1', ?, ?, ?, ?, 'active')`
    )
    stmt.run('v-1', 'A', '/p/a.mp4', '/p/a.vtt', null) // candidate
    stmt.run('v-2', 'B', '/p/b.mp4', '/p/b.vtt', 'already indexed')
    stmt.run('v-3', 'C', '/p/c.mp4', null, null) // no path → skip

    const rows = index.findVideosNeedingBackfill()
    expect(rows).toEqual([{ id: 'v-1', transcriptPath: '/p/a.vtt' }])
  })

  it('setTranscriptText updates the row and the FTS triggers expose it via search', () => {
    seedVideo(raw, 'v-1', 'Title', null)
    expect(index.search('snowflake', 10, 0)).toEqual([])
    index.setTranscriptText('v-1', 'a unique snowflake')
    const hits = index.search('snowflake', 10, 0)
    expect(hits).toHaveLength(1)
    expect(hits[0].videoId).toBe('v-1')
  })
})
