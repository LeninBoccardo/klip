import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

interface TagInputProps {
  /** Currently selected tags. Treated as the source of truth — controlled. */
  value: string[]
  /** Called whenever the tag list changes (chip removed, new tag committed). */
  onChange: (next: string[]) => void
  /** Optional autocomplete pool; the consumer typically passes `tags.map(t => t.tag)`. */
  suggestions?: string[]
  placeholder?: string
  disabled?: boolean
  className?: string
}

/**
 * Chip-based tag editor with cmdk-driven autocomplete.
 *
 * Interaction model:
 *   - Type to filter `suggestions`; Enter commits the highlighted suggestion,
 *     or, if the typed value matches no suggestion, commits it as a new tag.
 *   - Backspace on an empty input removes the last chip.
 *   - Click the X on a chip to remove it.
 *
 * The component is fully controlled — it doesn't fetch its own suggestions
 * or persist mutations; the consumer wires it to `useAllDistinctTags()` and
 * any mutation hook (`useBulkUpdateTags`, or a per-entity upsert).
 */
export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder,
  disabled,
  className
}: TagInputProps): React.ReactElement {
  const { t } = useTranslation('tags')
  const effectivePlaceholder = placeholder ?? t('input.placeholder')
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Hide suggestions that are already on the entity, then filter by the
  // current draft. cmdk's own filter handles fuzzy matching, but we still
  // pre-filter `selected` so the popover doesn't show "add `foo`" when foo
  // is already a chip.
  const selected = useMemo(() => new Set(value), [value])
  const candidates = useMemo(
    () => suggestions.filter((s) => !selected.has(s)),
    [suggestions, selected]
  )

  const trimmedDraft = draft.trim()
  const hasExactMatch = candidates.includes(trimmedDraft)
  const showCreateOption = trimmedDraft.length > 0 && !hasExactMatch && !selected.has(trimmedDraft)

  const commitTag = (tag: string): void => {
    const t = tag.trim()
    if (!t) return
    if (selected.has(t)) {
      setDraft('')
      return
    }
    onChange([...value, t])
    setDraft('')
  }

  const removeTag = (tag: string): void => {
    onChange(value.filter((t) => t !== tag))
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      event.preventDefault()
      onChange(value.slice(0, -1))
    } else if (event.key === ',' || (event.key === 'Enter' && !open)) {
      // Comma is a quick separator for power users; Enter when the popover is
      // closed commits the trimmed draft as-is. When the popover is open,
      // cmdk's keyboard handling routes Enter to the highlighted item.
      event.preventDefault()
      commitTag(draft)
    }
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-sm focus-within:ring-2 focus-within:ring-ring/40',
        disabled && 'pointer-events-none opacity-60',
        className
      )}
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((tag) => (
        <Badge key={tag} variant="secondary" className="gap-1 pl-2 pr-1">
          <span>{tag}</span>
          <button
            type="button"
            aria-label={t('input.removeAria', { tag })}
            className="rounded-full p-0.5 hover:bg-muted-foreground/20"
            onClick={(e) => {
              e.stopPropagation()
              removeTag(tag)
            }}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}

      <Popover open={open} onOpenChange={setOpen}>
        {/*
          PopoverAnchor (not PopoverTrigger) — Trigger has a built-in
          click-to-toggle that races our explicit `setOpen(true)` in
          onFocus. The race produced an alternating open/close flicker
          on every other click: trigger's toggle flips it closed right
          after onFocus opens it, then the next click reopens, ad
          infinitum. Anchor only provides the positioning reference,
          no click handling, so open/close is fully driven by our
          onFocus / onChange / outside-click logic.
        */}
        <PopoverAnchor asChild>
          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              if (!open) setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={value.length === 0 ? effectivePlaceholder : ''}
            disabled={disabled}
            className="h-7 min-w-[8ch] flex-1 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
          />
        </PopoverAnchor>
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) min-w-60 p-0"
          // Don't auto-focus; keep the input's caret active so typing keeps flowing.
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command shouldFilter>
            <CommandList>
              {candidates.length === 0 && !showCreateOption && (
                <CommandEmpty>{t('input.noMatches')}</CommandEmpty>
              )}
              {candidates.length > 0 && (
                <CommandGroup heading={t('input.existingHeading')}>
                  {candidates.map((tag) => (
                    <CommandItem key={tag} value={tag} onSelect={() => commitTag(tag)}>
                      {tag}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {showCreateOption && (
                <CommandGroup heading={t('input.createHeading')}>
                  <CommandItem
                    value={`__new__${trimmedDraft}`}
                    onSelect={() => commitTag(trimmedDraft)}
                  >
                    {t('input.createOption', { name: trimmedDraft })}
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
