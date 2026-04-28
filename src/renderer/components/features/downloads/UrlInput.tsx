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

const urlSchema = z.object({
  url: z.string().url('Enter a valid URL')
})

type UrlFormValues = z.infer<typeof urlSchema>

interface UrlInputProps {
  onSubmit: (url: string) => void
  isLoading?: boolean
}

export function UrlInput({ onSubmit, isLoading }: UrlInputProps): React.ReactElement {
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
            placeholder="Paste a video URL..."
            aria-invalid={!!errors.url}
            {...register('url')}
          />
        </InputGroup>
        <FieldError errors={[errors.url]} />
      </Field>
      <Button type="submit" disabled={isLoading}>
        {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
        Fetch Info
      </Button>
    </form>
  )
}
