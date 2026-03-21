/** Result of a media enrichment run */
export interface EnrichResult {
  videosProbed: number
  cutsProbed: number
  failures: number
}

/** Probes pending videos/cuts with ffprobe and persists metadata */
export interface IEnrichMediaMetadata {
  execute(): Promise<EnrichResult>
}
