/**
 * Recovery path: flips a previously-`missing` video back to `'active'`
 * after a successful YouTube fetch. Idempotent — only fires when the
 * video is currently missing, so a normal enrichment of an active
 * video is unchanged.
 *
 * Pairs with `IMarkVideoMissing`: together they implement the
 * "auto-recover on next enrichment" UX confirmed in the plan.
 */
export interface IMarkVideoActive {
  execute(videoId: string): void
}
