import type { CreatorDto, VideoDto, CutDto } from '../dtos'
import type { TagAggregation } from './tags'

/**
 * Aggregated result of a global search query, grouped by entity surface.
 *
 * The use case caps each surface independently — a creator-heavy query won't
 * starve videos/cuts out of the response, and the renderer can render fixed
 * sections without re-slicing. Tag matches are returned with their full
 * per-table counts so the palette can route the user to a tag-filter view.
 */
export interface SearchAllResult {
  creators: CreatorDto[]
  videos: VideoDto[]
  cuts: CutDto[]
  tags: TagAggregation[]
}
