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

export function RootPathDisplay({ rootPath }: RootPathDisplayProps) {
  return (
    <Field>
      <FieldLabel>Root directory</FieldLabel>
      <InputGroup>
        <InputGroupAddon>
          <InputGroupText>
            <FolderOpen />
          </InputGroupText>
        </InputGroupAddon>
        <InputGroupInput value={rootPath ?? 'Not set'} readOnly className="bg-muted" />
      </InputGroup>
    </Field>
  )
}
