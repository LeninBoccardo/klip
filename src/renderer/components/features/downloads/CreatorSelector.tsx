import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'

interface CreatorSelectorProps {
  value: string
  onChange: (value: string) => void
}

/**
 * Simple text input for the creator name.
 * In the future this can be upgraded to a Combobox with existing creator suggestions.
 */
export function CreatorSelector({ value, onChange }: CreatorSelectorProps) {
  return (
    <Field>
      <FieldLabel htmlFor="creator-name">Creator name</FieldLabel>
      <Input
        id="creator-name"
        placeholder="e.g. MrBeast"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  )
}
