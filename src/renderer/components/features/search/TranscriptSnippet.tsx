import { Fragment } from 'react'
import { parseSnippet } from '@/lib/highlight-snippet'

interface TranscriptSnippetProps {
  snippet: string
  className?: string
}

export function TranscriptSnippet({
  snippet,
  className
}: TranscriptSnippetProps): React.ReactElement {
  const segments = parseSnippet(snippet)
  return (
    <span className={className}>
      {segments.map((seg, i) => (
        <Fragment key={i}>
          {seg.highlighted ? (
            <mark className="rounded bg-amber-300/40 px-0.5 text-foreground dark:bg-amber-500/30">
              {seg.text}
            </mark>
          ) : (
            seg.text
          )}
        </Fragment>
      ))}
    </span>
  )
}
