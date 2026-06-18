import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { RenameCollectionDialog } from '@/components/features/collections/RenameCollectionDialog'
import type { CollectionDto } from '@shared/dtos'

const success = vi.fn()
const error = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => success(...args),
    error: (...args: unknown[]) => error(...args)
  }
}))

const renameCollection = vi.fn()

function makeCollection(overrides: Partial<CollectionDto> = {}): CollectionDto {
  return {
    id: 'col-1',
    name: 'Favourites',
    description: 'My picks',
    kind: 'manual',
    itemCount: 3,
    createdAt: '',
    updatedAt: '',
    ...overrides
  }
}

beforeEach(() => {
  success.mockReset()
  error.mockReset()
  renameCollection.mockReset().mockResolvedValue(makeCollection())
  Object.defineProperty(window, 'api', {
    value: { renameCollection },
    writable: true,
    configurable: true
  })
})

function renderDialog(ui: React.ReactElement): { qc: QueryClient } {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } }
  })
  render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
  return { qc }
}

describe('RenameCollectionDialog', () => {
  it('renders the dialog title and description', () => {
    renderDialog(
      <RenameCollectionDialog open onOpenChange={() => {}} collection={makeCollection()} />
    )
    expect(screen.getByText('Edit collection')).toBeInTheDocument()
    expect(screen.getByText('Rename or update the description.')).toBeInTheDocument()
  })

  it('does not render the form when closed', () => {
    renderDialog(
      <RenameCollectionDialog open={false} onOpenChange={() => {}} collection={makeCollection()} />
    )
    expect(screen.queryByLabelText('Name')).toBeNull()
  })

  it('does not render the form when collection is null even if open', () => {
    renderDialog(<RenameCollectionDialog open onOpenChange={() => {}} collection={null} />)
    expect(screen.queryByLabelText('Name')).toBeNull()
  })

  it('seeds the inputs from the collection name and description', () => {
    renderDialog(
      <RenameCollectionDialog
        open
        onOpenChange={() => {}}
        collection={makeCollection({ name: 'Favourites', description: 'My picks' })}
      />
    )
    expect(screen.getByLabelText('Name')).toHaveValue('Favourites')
    expect(screen.getByLabelText('Description')).toHaveValue('My picks')
  })

  it('seeds the description to empty string when the collection description is null', () => {
    renderDialog(
      <RenameCollectionDialog
        open
        onOpenChange={() => {}}
        collection={makeCollection({ description: null })}
      />
    )
    expect(screen.getByLabelText('Description')).toHaveValue('')
  })

  it('disables Save when the name is trimmed to empty, re-enables on non-whitespace', async () => {
    const user = userEvent.setup()
    renderDialog(
      <RenameCollectionDialog
        open
        onOpenChange={() => {}}
        collection={makeCollection({ name: 'Favourites' })}
      />
    )

    const save = screen.getByRole('button', { name: /save/i })
    expect(save).toBeEnabled()

    const nameInput = screen.getByLabelText('Name')
    await user.clear(nameInput)
    expect(save).toBeDisabled()

    await user.type(nameInput, '   ')
    expect(save).toBeDisabled()

    await user.type(nameInput, 'Renamed')
    expect(save).toBeEnabled()
  })

  it('submits with trimmed name + description, toasts success, then closes', async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    renderDialog(
      <RenameCollectionDialog
        open
        onOpenChange={onOpenChange}
        collection={makeCollection({ id: 'col-9', name: 'Old', description: 'old desc' })}
      />
    )

    const nameInput = screen.getByLabelText('Name')
    const descInput = screen.getByLabelText('Description')
    await user.clear(nameInput)
    await user.type(nameInput, '  New name  ')
    await user.clear(descInput)
    await user.type(descInput, '  new desc  ')
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() =>
      expect(renameCollection).toHaveBeenCalledWith({
        id: 'col-9',
        name: 'New name',
        description: 'new desc'
      })
    )
    expect(success).toHaveBeenCalledWith('Collection updated')
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(error).not.toHaveBeenCalled()
  })

  it('sends null description when the description is whitespace-only', async () => {
    const user = userEvent.setup()
    renderDialog(
      <RenameCollectionDialog
        open
        onOpenChange={() => {}}
        collection={makeCollection({ id: 'col-2', name: 'Keep', description: 'something' })}
      />
    )

    const descInput = screen.getByLabelText('Description')
    await user.clear(descInput)
    await user.type(descInput, '   ')
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() =>
      expect(renameCollection).toHaveBeenCalledWith({
        id: 'col-2',
        name: 'Keep',
        description: null
      })
    )
  })

  it('toasts an error and stays open when the rename fails', async () => {
    renameCollection.mockRejectedValue(new Error('boom'))
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    renderDialog(
      <RenameCollectionDialog
        open
        onOpenChange={onOpenChange}
        collection={makeCollection({ name: 'Keep' })}
      />
    )

    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(error).toHaveBeenCalledWith('Failed to update: boom'))
    expect(success).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('shows a spinner and disables Save while the mutation is pending', async () => {
    let resolveRename: (value: CollectionDto) => void = () => {}
    renameCollection.mockImplementation(
      () =>
        new Promise<CollectionDto>((resolve) => {
          resolveRename = resolve
        })
    )
    const user = userEvent.setup()
    renderDialog(
      <RenameCollectionDialog
        open
        onOpenChange={() => {}}
        collection={makeCollection({ name: 'Keep' })}
      />
    )

    const save = screen.getByRole('button', { name: /save/i })
    await user.click(save)

    await waitFor(() => expect(save).toBeDisabled())
    // The Loader2 spinner is rendered inside the Radix dialog portal (document.body).
    expect(document.querySelector('.animate-spin')).not.toBeNull()

    resolveRename(makeCollection())
    await waitFor(() => expect(success).toHaveBeenCalled())
  })

  it('does not submit when the name is empty and Enter is pressed (early return)', async () => {
    const user = userEvent.setup()
    renderDialog(
      <RenameCollectionDialog
        open
        onOpenChange={() => {}}
        collection={makeCollection({ name: 'Favourites' })}
      />
    )

    const nameInput = screen.getByLabelText('Name')
    await user.clear(nameInput)
    await user.type(nameInput, '   {Enter}')

    expect(renameCollection).not.toHaveBeenCalled()
    expect(success).not.toHaveBeenCalled()
  })

  it('calls onOpenChange(false) when Cancel is clicked', async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    renderDialog(
      <RenameCollectionDialog open onOpenChange={onOpenChange} collection={makeCollection()} />
    )

    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(renameCollection).not.toHaveBeenCalled()
  })
})
