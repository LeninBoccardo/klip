import type { ICreatorRepository, IVideoRepository, ICutRepository } from '@domain/repositories'
import type { SearchAllResult } from '@shared/types'
import {
  toCreatorDto,
  toVideoDto,
  toCutDto
} from '@main/interface-adapters/controllers/dto-mappers'
import type { ISearchAll } from './ISearchAll'
import type { IGetAllDistinctTags } from './IGetAllDistinctTags'

const DEFAULT_LIMIT = 8
const MAX_LIMIT = 50

/**
 * Implements global search via per-surface repo queries that share the same
 * trimmed substring.
 *
 * Why per-surface (not a single UNION): each table has its own ordering
 * (creators by name asc, videos/cuts by createdAt desc) and its own cap. A
 * single UNION query loses the ordering signal and forces a global sort that
 * isn't what the palette wants. The four repo round-trips fit in a few ms at
 * the documented 5K-row scale (audit 03), and the use case stays trivial.
 *
 * Tag matching reuses the existing distinct-tag aggregation rather than a
 * dedicated SQL query — substring-filtering at the JS layer scales fine for
 * the realistic tag-vocabulary size (a few hundred at most), avoids a third
 * `json_each` query, and keeps the use case insulated from JSON-tokenization
 * details.
 */
export class SearchAll implements ISearchAll {
  constructor(
    private readonly creatorRepo: ICreatorRepository,
    private readonly videoRepo: IVideoRepository,
    private readonly cutRepo: ICutRepository,
    private readonly getAllDistinctTags: IGetAllDistinctTags
  ) {}

  execute(query: string, limit: number = DEFAULT_LIMIT): SearchAllResult {
    const trimmed = query.trim()
    if (trimmed.length === 0) {
      return { creators: [], videos: [], cuts: [], tags: [] }
    }

    const cap = clamp(limit, 1, MAX_LIMIT)

    const creators = this.creatorRepo.searchByName(trimmed, cap).map(toCreatorDto)
    const videos = this.videoRepo.searchByTitle(trimmed, cap).map(toVideoDto)
    const cuts = this.cutRepo.searchByTitle(trimmed, cap).map(toCutDto)

    const needle = trimmed.toLowerCase()
    const tags = this.getAllDistinctTags
      .execute()
      .filter((t) => t.tag.toLowerCase().includes(needle))
      .slice(0, cap)

    return { creators, videos, cuts, tags }
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.floor(value)))
}
