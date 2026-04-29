import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { CreateCollectionDialog } from '@/components/features/collections/CreateCollectionDialog'

const createCollection = vi.fn()

beforeEach(() => {
  createCollection.mockReset().mockResolvedValue({
    id: 'new',
    name: 'My picks',
    description: 'desc',
    kind: 'manual',
    itemCount: 0,
    createdAt: '',
    updatedAt: ''
  })
  Object.defineProperty(window, 'api', {
    value: { createCollection },
    writable: true,
    configurable: true
  })
})

function renderDialog(
  ui: React.ReactElement,
  options?: { onCreated?: (created: unknown) => void }
): { qc: QueryClient } {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } }
  })
  render(
    <QueryClientProvider client={qc}>
      {React.cloneElement(ui as React.ReactElement<{ onCreated?: typeof options.onCreated }>, {
        onCreated: options?.onCreated
      })}
    </QueryClientProvider>
  )
  return { qc }
}

describe('CreateCollectionDialog', () => {
  it('does not render the form when closed', () => {
    renderDialog(<CreateCollectionDialog open={false} onOpenChange={() => {}} />)
    expect(screen.queryByLabelText('Name')).toBeNull()
  })

  it('disables the Create button until a non-whitespace name is entered', async () => {
    const user = userEvent.setup()
    renderDialog(<CreateCollectionDialog open onOpenChange={() => {}} />)

    const submit = screen.getByRole('button', { name: /create/i })
    expect(submit).toBeDisabled()

    const nameInput = screen.getByLabelText('Name')
    await user.type(nameInput, '   ')
    expect(submit).toBeDisabled()

    await user.type(nameInput, 'My picks')
    expect(submit).toBeEnabled()
  })

  it('submits with trimmed name + description, fires onCreated, then closes', async () => {
    const onOpenChange = vi.fn()
    const onCreated = vi.fn()
    const user = userEvent.setup()
    renderDialog(<CreateCollectionDialog open onOpenChange={onOpenChange} />, { onCreated })

    await user.type(screen.getByLabelText('Name'), '  My picks  ')
    await user.type(screen.getByLabelText('Description (optional)'), '  desc  ')
    await user.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() =>
      expect(createCollection).toHaveBeenCalledWith({
        name: 'My picks',
        description: 'desc'
      })
    )
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onCreated).toHaveBeenCalled()
  })
})
