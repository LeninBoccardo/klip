import { RadioGroup, RadioGroupItem } from '@ui/radio-group'
import { Skeleton } from '@ui/skeleton'
import { Label } from '@ui/label'
import { usePlaybackOnNavigate, useSetPlaybackOnNavigate } from '@/hooks/use-playback-setting'
import { isPlaybackOnNavigate, type PlaybackOnNavigate } from '@shared/types'
import { toast } from 'sonner'

const OPTIONS: ReadonlyArray<{
  value: PlaybackOnNavigate
  label: string
  description: string
}> = [
  {
    value: 'floating',
    label: 'Float in mini-player',
    description: 'Keep playing in a floating window in the bottom-right corner.'
  },
  {
    value: 'pause',
    label: 'Pause and remember',
    description: 'Pause the video; resume from the same time when you return.'
  },
  {
    value: 'stop',
    label: 'Stop and reset',
    description: 'Close the player; returning starts the video from the beginning.'
  }
]

/**
 * Radio group control for the `playbackOnNavigate` setting. Drives whether
 * leaving the video detail page floats the player into a mini dock, pauses
 * with resume-on-return, or fully stops playback.
 */
export function PlaybackSettings(): React.ReactElement {
  const { data, isLoading } = usePlaybackOnNavigate()
  const setMutation = useSetPlaybackOnNavigate()

  const handleChange = (next: string): void => {
    if (!isPlaybackOnNavigate(next)) return
    setMutation.mutate(next, {
      onError: (err) => toast.error(`Failed to save preference: ${err.message}`)
    })
  }

  if (isLoading || !data) return <Skeleton className="h-24 w-full" />

  return (
    <RadioGroup value={data} onValueChange={handleChange} disabled={setMutation.isPending}>
      {OPTIONS.map((opt) => (
        <Label
          key={opt.value}
          htmlFor={`playbackOnNavigate-${opt.value}`}
          className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/50"
        >
          <RadioGroupItem id={`playbackOnNavigate-${opt.value}`} value={opt.value} />
          <div className="space-y-1">
            <p className="text-sm font-medium">{opt.label}</p>
            <p className="text-xs text-muted-foreground">{opt.description}</p>
          </div>
        </Label>
      ))}
    </RadioGroup>
  )
}
