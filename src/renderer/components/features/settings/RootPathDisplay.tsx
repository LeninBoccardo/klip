import { useTranslation } from 'react-i18next'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText
} from '@/components/ui/input-group'
import { Field, FieldLabel } from '@/components/ui/field'
import { FolderOpen } from 'lucide-react'

interface RootPathDisplayProps {
  rootPath: string | null | undefined
}

export function RootPathDisplay({ rootPath }: RootPathDisplayProps): React.ReactElement {
  const { t } = useTranslation('settings')
  return (
    <Field>
      <FieldLabel>{t('storage.rootLabel')}</FieldLabel>
      <InputGroup>
        <InputGroupAddon>
          <InputGroupText>
            <FolderOpen />
          </InputGroupText>
        </InputGroupAddon>
        <InputGroupInput value={rootPath ?? t('storage.notSet')} readOnly className="bg-muted" />
      </InputGroup>
    </Field>
  )
}
