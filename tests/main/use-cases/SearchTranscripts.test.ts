import { describe, it, expect, vi } from 'vitest'
import { SearchTranscripts } from '@use-cases/SearchTranscripts'
import type { IVideoTranscriptIndex } from '@domain/ports'
import type { TranscriptSearchHit } from '@shared/types'

function makeIndex(overrides: Partial<IVideoTranscriptIndex> = {}): IVideoTranscriptIndex {
  return {
    search: vi.fn().mockReturnValue([]),
    countApproximate: vi.fn().mockReturnValue(0),
    setTranscriptText: vi.fn(),
    findVideosNeedingBackfill: vi.fn().mockReturnValue([]),
    ...overrides
  }
}

describe('SearchTranscripts', () => {
  it('returns empty result when query is empty/whitespace without touching the index', () => {
    const index = makeIndex()
    const useCase = new SearchTranscripts(index)
    expect(useCase.execute({ query: '', limit: 10, offset: 0 })).toEqual({
      hits: [],
      totalApproximate: 0
    })
    expect(useCase.execute({ query: '   ', limit: 10, offset: 0 })).toEqual({
      hits: [],
      totalApproximate: 0
    })
    expect(index.search).not.toHaveBeenCalled()
    expect(index.countApproximate).not.toHaveBeenCalled()
  })

  it('forwards query, limit, and offset to the index', () => {
    const hits: TranscriptSearchHit[] = [
      { videoId: 'v-1', title: 'Test', snippet: 'a <<<hello>>> b', rank: -3.5 }
    ]
    const index = makeIndex({
      search: vi.fn().mockReturnValue(hits),
      countApproximate: vi.fn().mockReturnValue(42)
    })
    const useCase = new SearchTranscripts(index)

    const result = useCase.execute({ query: 'hello', limit: 20, offset: 40 })

    expect(index.search).toHaveBeenCalledWith('hello', 20, 40)
    expect(index.countApproximate).toHaveBeenCalledWith('hello', 1000)
    expect(result.hits).toEqual(hits)
    expect(result.totalApproximate).toBe(42)
  })
})
