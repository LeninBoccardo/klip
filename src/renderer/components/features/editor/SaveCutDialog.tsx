import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@ui/dialog'
import { Field, FieldLabel, FieldDescription, FieldError } from '@ui/field'
import { Input } from '@ui/input'
import { Separator } from '@ui/separator'
import { TagInput } from '@/components/shared'
import { useAllDistinctTags } from '@/hooks/use-tags'
import { useEditorStore, type RenderMode } from '@/hooks/use-editor-store'
import { recipeFromTimeline, isTimelineSaveable } from '@/lib/recipe-from-timeline'
import type { RenderCutResponse } from '@shared/types'
import { PrecisionToggle } from './PrecisionToggle'

/**
 * The single point where the user commits a render. Reads the timeline
 * from the editor store, projects it into an `EditRecipe`, fires
 * `editorStartRender` over IPC, and starts tracking the returned jobId
 * so the RenderProgress overlay picks up live status. On error the
 * dialog stays open with the error rendered inline.
 */
export function SaveCutDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
}): React.ReactElement {
  const { t } = useTranslation('editor')
  const timeline = useEditorStore((s) => s.timeline)
  const renderMode = useEditorStore((s) => s.renderMode)
  const setRenderMode = useEditorStore((s) => s.setRenderMode)
  const beginTracking = useEditorStore((s) => s.beginTracking)

  const { data: distinctTags } = useAllDistinctTags()
  const tagSuggestions = distinctTags?.map((t) => t.tag) ?? []

  const [title, setTitle] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // Synchronous re-entrancy guard. `submitting` is React state set
  // asynchronously, so two fast clicks (or a double-click) both read
  // `submitting === false` and pass `canSubmit` before the disabled re-render
  // commits — firing two renders and creating two Cut rows for one trim. A ref
  // flips synchronously, so the second in-flight click is rejected.
  const submittingRef = useRef(false)

  // Reset form fields whenever the dialog opens — saving once and reopening
  // should not pre-populate with the previous title/tags.
  useEffect(() => {
    if (open) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setTitle('')
      setTags([])
      setSubmitError(null)
      setSubmitting(false)
      /* eslint-enable react-hooks/set-state-in-effect */
      submittingRef.current = false
    }
  }, [open])

  const saveable = !!timeline && isTimelineSaveable(timeline)
  const titleTrimmed = title.trim()
  const canSubmit = saveable && titleTrimmed.length > 0 && !submitting

  const handleSubmit = async (): Promise<void> => {
    if (!timeline || !canSubmit) return
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    setSubmitError(null)
    try {
      const recipe = recipeFromTimeline(timeline, {
        // MVP defaults the container to mp4. The output container becomes
        // user-tweakable in v2; locking it here keeps the UI simple and
        // matches what the existing reconcile sidecar expects.
        container: 'mp4',
        mode: renderMode
      })
      const response: RenderCutResponse = await window.api.editorStartRender({
        recipe,
        title: titleTrimmed,
        tags
      })
      beginTracking({ jobId: response.jobId, cutId: response.cutId })
      onOpenChange(false)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err))
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('save.title')}</DialogTitle>
          <DialogDescription>{t('save.description')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="cut-title">{t('save.fields.titleLabel')}</FieldLabel>
            <Input
              id="cut-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('save.fields.titlePlaceholder')}
              autoFocus
              maxLength={200}
            />
            <FieldDescription>{t('save.fields.titleDescription')}</FieldDescription>
          </Field>

          <Field>
            <FieldLabel>{t('save.fields.tagsLabel')}</FieldLabel>
            <TagInput value={tags} onChange={setTags} suggestions={tagSuggestions} />
          </Field>

          <Separator />

          <Field>
            <FieldLabel>{t('save.fields.renderModeLabel')}</FieldLabel>
            <PrecisionToggle
              value={renderMode}
              onChange={(m: RenderMode) => setRenderMode(m)}
              disabled={submitting}
            />
          </Field>

          {!saveable && <FieldError>{t('save.errors.noRegion')}</FieldError>}
          {submitError && <FieldError>{submitError}</FieldError>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('save.actions.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? t('save.actions.submitting') : t('save.actions.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
