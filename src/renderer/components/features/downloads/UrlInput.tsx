import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText
} from '@/components/ui/input-group'
import { Field, FieldError } from '@/components/ui/field'
import { Loader2, Link as LinkIcon } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

interface UrlInputProps {
  onSubmit: (url: string) => void
  isLoading?: boolean
}

export function UrlInput({ onSubmit, isLoading }: UrlInputProps): React.ReactElement {
  const { t } = useTranslation('downloads')

  // Schema is rebuilt per-render so the Zod validation message reflects the
  // active language (i18next re-renders consumers on `languageChanged`).
  const urlSchema = z.object({
    url: z.string().url(t('url.invalid'))
  })
  type UrlFormValues = z.infer<typeof urlSchema>

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<UrlFormValues>({
    resolver: zodResolver(urlSchema)
  })

  return (
    <form onSubmit={handleSubmit((data) => onSubmit(data.url))} className="flex items-start gap-2">
      <Field className="flex-1">
        <InputGroup>
          <InputGroupAddon>
            <InputGroupText>
              <LinkIcon />
            </InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            placeholder={t('url.placeholder')}
            aria-invalid={!!errors.url}
            {...register('url')}
          />
        </InputGroup>
        <FieldError errors={[errors.url]} />
      </Field>
      <Button type="submit" disabled={isLoading}>
        {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
        {t('url.fetchButton')}
      </Button>
    </form>
  )
}
