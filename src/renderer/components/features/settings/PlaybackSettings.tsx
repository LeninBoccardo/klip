import { useTranslation } from 'react-i18next'
import { RadioGroup, RadioGroupItem } from '@ui/radio-group'
import { Skeleton } from '@ui/skeleton'
import { Label } from '@ui/label'
import { usePlaybackOnNavigate, useSetPlaybackOnNavigate } from '@/hooks/use-playback-setting'
import {
  isPlaybackOnNavigate,
  PLAYBACK_ON_NAVIGATE_VALUES,
  type PlaybackOnNavigate
} from '@shared/types'
import { toast } from 'sonner'

/**
 * Radio group control for the `playbackOnNavigate` setting. Drives whether
 * leaving the video detail page floats the player into a mini dock, pauses
 * with resume-on-return, or fully stops playback.
 */
export function PlaybackSettings(): React.ReactElement {
  const { t } = useTranslation('settings')
  const { data, isLoading } = usePlaybackOnNavigate()
  const setMutation = useSetPlaybackOnNavigate()

  const handleChange = (next: string): void => {
    if (!isPlaybackOnNavigate(next)) return
    setMutation.mutate(next, {
      onError: (err) => toast.error(t('playback.saveError', { message: err.message }))
    })
  }

  if (isLoading || !data) return <Skeleton className="h-24 w-full" />

  return (
    <RadioGroup value={data} onValueChange={handleChange} disabled={setMutation.isPending}>
      {PLAYBACK_ON_NAVIGATE_VALUES.map((value: PlaybackOnNavigate) => (
        <Label
          key={value}
          htmlFor={`playbackOnNavigate-${value}`}
          className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/50"
        >
          <RadioGroupItem id={`playbackOnNavigate-${value}`} value={value} />
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {t(`playback.options.${value}.label` as 'playback.options.floating.label')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t(
                `playback.options.${value}.description` as 'playback.options.floating.description'
              )}
            </p>
          </div>
        </Label>
      ))}
    </RadioGroup>
  )
}
