import type { IVideoTranscriptIndex } from '@domain/ports'
import type { SearchTranscriptsParams, TranscriptSearchResult } from '@shared/types'
import type { ISearchTranscripts } from './ISearchTranscripts'

/**
 * The approximate-count cap protects the count subquery from O(N) work for a
 * very common term against a multi-thousand-video corpus. The renderer
 * surfaces "1000+" once the cap is hit.
 */
const COUNT_CAP = 1000

export class SearchTranscripts implements ISearchTranscripts {
  constructor(private readonly index: IVideoTranscriptIndex) {}

  execute(params: SearchTranscriptsParams): TranscriptSearchResult {
    const { query, limit, offset } = params
    if (!query || query.trim().length === 0) {
      return { hits: [], totalApproximate: 0 }
    }
    const hits = this.index.search(query, limit, offset)
    const totalApproximate = this.index.countApproximate(query, COUNT_CAP)
    return { hits, totalApproximate }
  }
}
