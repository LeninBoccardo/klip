import type { SearchTranscriptsParams, TranscriptSearchResult } from '@shared/types'

/**
 * Run a phrase query against the FTS5 transcript index. Returns ranked
 * snippets and an approximate total match count for paging.
 */
export interface ISearchTranscripts {
  execute(params: SearchTranscriptsParams): TranscriptSearchResult
}
