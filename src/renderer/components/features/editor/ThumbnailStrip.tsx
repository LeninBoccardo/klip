import { mediaUrl } from '@/lib/format'

/**
 * MVP placeholder for the thumbnail strip behind the timeline. Renders
 * the source video's poster as a tiled, dimmed background — enough
 * visual texture to anchor the timeline's left/right ends without
 * paying the cost of generating per-second scrub thumbnails.
 *
 * v2 swaps this for a strip of ffmpeg-extracted frames cached under
 * `<root>/.klip-cache/scrub/<videoId>/` (plan §7.4). The component
 * boundary stays — `<Timeline>` doesn't care what fills the strip.
 */
export function ThumbnailStrip({ sourceVideoId }: { sourceVideoId: string }): React.ReactElement {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-40"
      style={{
        backgroundImage: `url(${mediaUrl('video', sourceVideoId, 'thumbnail')})`,
        backgroundSize: 'auto 100%',
        backgroundRepeat: 'repeat-x'
      }}
    />
  )
}
