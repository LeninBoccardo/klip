import { useEffect, useRef } from 'react'
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

export const URL_INPUT_FOCUS_EVENT = 'klip:focus-url-input'

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

  const inputRef = useRef<HTMLInputElement | null>(null)
  const { ref: registerRef, ...registerProps } = register('url')

  useEffect(() => {
    const onFocusRequest = (): void => {
      inputRef.current?.focus()
      inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    window.addEventListener(URL_INPUT_FOCUS_EVENT, onFocusRequest)
    return () => window.removeEventListener(URL_INPUT_FOCUS_EVENT, onFocusRequest)
  }, [])

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
            {...registerProps}
            ref={(node) => {
              registerRef(node)
              inputRef.current = node
            }}
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
