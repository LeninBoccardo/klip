import { describe, it, expect, vi } from 'vitest'
import { BackfillTranscriptIndex } from '@use-cases/BackfillTranscriptIndex'
import type { IFileSystemReader, IVideoTranscriptIndex } from '@domain/ports'

function makeIndex(
  candidates: Array<{ id: string; transcriptPath: string }>
): IVideoTranscriptIndex {
  return {
    search: vi.fn().mockReturnValue([]),
    countApproximate: vi.fn().mockReturnValue(0),
    setTranscriptText: vi.fn(),
    findVideosNeedingBackfill: vi.fn().mockReturnValue(candidates)
  }
}

function makeReader(files: Record<string, string | null>): IFileSystemReader {
  return {
    directoryExists: vi.fn(),
    fileExists: vi.fn(),
    listDirectories: vi.fn(),
    listFiles: vi.fn(),
    readJsonFile: vi.fn(),
    readTextFile: vi.fn((path: string) => files[path] ?? null)
  } as IFileSystemReader
}

const VTT = `WEBVTT

00:00:00.000 --> 00:00:01.000
Hello world
`

describe('BackfillTranscriptIndex', () => {
  it('parses each candidate VTT and writes transcript_text', async () => {
    const index = makeIndex([
      { id: 'v-1', transcriptPath: '/p/v-1.vtt' },
      { id: 'v-2', transcriptPath: '/p/v-2.vtt' }
    ])
    const fsReader = makeReader({
      '/p/v-1.vtt': VTT,
      '/p/v-2.vtt': VTT
    })
    const useCase = new BackfillTranscriptIndex(index, fsReader)

    const result = await useCase.execute()

    expect(result.indexed).toBe(2)
    expect(result.missing).toBe(0)
    expect(result.failed).toBe(0)
    expect(index.setTranscriptText).toHaveBeenCalledTimes(2)
    expect(vi.mocked(index.setTranscriptText).mock.calls[0]).toEqual(['v-1', 'Hello world'])
  })

  it('counts missing files and continues', async () => {
    const index = makeIndex([
      { id: 'v-1', transcriptPath: '/p/v-1.vtt' },
      { id: 'v-2', transcriptPath: '/p/v-2.vtt' }
    ])
    const fsReader = makeReader({
      '/p/v-1.vtt': VTT
      // v-2.vtt deliberately absent → reader returns null
    })
    const useCase = new BackfillTranscriptIndex(index, fsReader)

    const result = await useCase.execute()

    expect(result.indexed).toBe(1)
    expect(result.missing).toBe(1)
    expect(result.failed).toBe(0)
    expect(index.setTranscriptText).toHaveBeenCalledTimes(1)
  })

  it('counts parse failures (bad VTT) without aborting the run', async () => {
    const index = makeIndex([
      { id: 'v-1', transcriptPath: '/p/v-1.vtt' },
      { id: 'v-2', transcriptPath: '/p/v-2.vtt' }
    ])
    const huge = 'x'.repeat(11 * 1024 * 1024) // exceeds parse-vtt's 10 MB cap
    const fsReader = makeReader({
      '/p/v-1.vtt': huge,
      '/p/v-2.vtt': VTT
    })
    const useCase = new BackfillTranscriptIndex(index, fsReader)

    const result = await useCase.execute()

    expect(result.failed).toBe(1)
    expect(result.indexed).toBe(1)
  })

  it('returns zero counts when there are no candidates', async () => {
    const index = makeIndex([])
    const fsReader = makeReader({})
    const useCase = new BackfillTranscriptIndex(index, fsReader)

    const result = await useCase.execute()

    expect(result).toEqual({ alreadyIndexed: 0, indexed: 0, missing: 0, failed: 0 })
    expect(index.setTranscriptText).not.toHaveBeenCalled()
  })
})
