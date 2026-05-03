import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@ui/dialog'
import { Button } from '@ui/button'
import { useSetting } from '@/hooks/use-settings'
import { useMigrateRoot } from '@/hooks/use-migrate-root'
import { AppearanceSettings } from '@components/features/settings/AppearanceSettings'
import { LanguageSettings } from '@components/features/settings/LanguageSettings'
import { useOnboardingState } from '@/hooks/use-onboarding'
import { ArrowLeft, ArrowRight, FolderSync, Check, Download, Folder, Search } from 'lucide-react'
import { toast } from 'sonner'

const TOTAL_STEPS = 3

export function OnboardingWizard(): React.ReactElement | null {
  const { t } = useTranslation('onboarding')
  const { shouldShow, complete } = useOnboardingState()
  const [step, setStep] = useState(1)

  if (!shouldShow) return null

  const next = (): void => setStep((s) => Math.min(s + 1, TOTAL_STEPS))
  const back = (): void => setStep((s) => Math.max(s - 1, 1))
  const handleFinish = (): void => complete()
  const handleSkip = (): void => complete()

  return (
    <Dialog open onOpenChange={(open) => !open && handleSkip()}>
      <DialogContent
        className="sm:max-w-xl"
        showCloseButton={false}
        // Block Esc + outside-click so the user has to make an explicit
        // choice (Skip or Get started). Ensures `hasCompletedOnboarding`
        // always flips on dismissal.
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t('step', { current: step, total: TOTAL_STEPS })}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && <StepRoot />}
        {step === 2 && <StepPreferences />}
        {step === 3 && <StepTour />}

        <div className="flex items-center justify-between gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={handleSkip}>
            {t('actions.skip')}
          </Button>
          <div className="flex items-center gap-2">
            {step > 1 && (
              <Button variant="outline" onClick={back}>
                <ArrowLeft className="mr-2 size-4" />
                {t('actions.back')}
              </Button>
            )}
            {step < TOTAL_STEPS ? (
              <Button onClick={next}>
                {t('actions.next')}
                <ArrowRight className="ml-2 size-4" />
              </Button>
            ) : (
              <Button onClick={handleFinish}>
                <Check className="mr-2 size-4" />
                {t('actions.finish')}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function StepRoot(): React.ReactElement {
  const { t } = useTranslation('onboarding')
  const { data: rootPath } = useSetting('rootPath')
  const { mutation, selectFolder } = useMigrateRoot()

  const handleChange = async (): Promise<void> => {
    const folder = await selectFolder()
    if (!folder || folder === rootPath) return
    mutation.mutate(folder, {
      onError: (err) => toast.error(err.message)
    })
  }

  return (
    <div className="space-y-3">
      <h3 className="text-base font-medium">{t('steps.root.title')}</h3>
      <p className="text-sm text-muted-foreground">{t('steps.root.description')}</p>
      <div className="rounded-md border bg-muted/40 p-3">
        <p className="text-xs text-muted-foreground">{t('steps.root.currentLabel')}</p>
        <p className="font-mono text-sm break-all">{rootPath ?? '—'}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleChange}
        disabled={mutation.isPending}
      >
        <FolderSync className="mr-2 size-4" />
        {t('steps.root.change')}
      </Button>
    </div>
  )
}

function StepPreferences(): React.ReactElement {
  const { t } = useTranslation('onboarding')

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('steps.preferences.description')}</p>
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {t('steps.preferences.themeLabel')}
        </p>
        <AppearanceSettings />
      </div>
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {t('steps.preferences.languageLabel')}
        </p>
        <LanguageSettings />
      </div>
    </div>
  )
}

function StepTour(): React.ReactElement {
  const { t } = useTranslation('onboarding')
  const cards = [
    { key: 'download', icon: Download },
    { key: 'organise', icon: Folder },
    { key: 'search', icon: Search }
  ] as const

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t('steps.tour.description')}</p>
      <ul className="space-y-2">
        {cards.map(({ key, icon: Icon }) => (
          <li
            key={key}
            className="flex items-start gap-3 rounded-md border p-3"
          >
            <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {t(`steps.tour.cards.${key}.title` as const)}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(`steps.tour.cards.${key}.body` as const)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
