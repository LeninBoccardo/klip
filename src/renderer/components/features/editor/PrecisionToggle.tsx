import { useTranslation } from 'react-i18next'
import { Label } from '@ui/label'
import { RadioGroup, RadioGroupItem } from '@ui/radio-group'
import type { RenderMode } from '@/hooks/use-editor-store'

/**
 * The single-knob render-quality toggle from plan §8.Q1. Exposed inside
 * the SaveCutDialog so the user picks per-render rather than as a
 * persistent setting; defaults to `copy` because the killer property of
 * this editor is "instant trim", and the user opts in to slowness only
 * when they need frame accuracy.
 */
export function PrecisionToggle({
  value,
  onChange,
  disabled
}: {
  value: RenderMode
  onChange: (next: RenderMode) => void
  disabled?: boolean
}): React.ReactElement {
  const { t } = useTranslation('editor')
  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onChange(v as RenderMode)}
      disabled={disabled}
      className="grid grid-cols-1 gap-2"
    >
      <Label
        htmlFor="precision-copy"
        className="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-checked:border-primary"
      >
        <RadioGroupItem id="precision-copy" value="copy" className="mt-0.5" />
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{t('precision.fast.label')}</span>
          <span className="text-xs text-muted-foreground">{t('precision.fast.description')}</span>
        </div>
      </Label>
      <Label
        htmlFor="precision-reencode"
        className="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-checked:border-primary"
      >
        <RadioGroupItem id="precision-reencode" value="reencode" className="mt-0.5" />
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{t('precision.precise.label')}</span>
          <span className="text-xs text-muted-foreground">
            {t('precision.precise.description')}
          </span>
        </div>
      </Label>
    </RadioGroup>
  )
}
