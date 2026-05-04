import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import i18n from '@renderer/i18n'
import { MoveToCreatorDialog } from '@/components/features/videos/MoveToCreatorDialog'
import { useCreatorsPaginated } from '@/hooks/use-creators'
import { useMoveVideosToCreator } from '@/hooks/use-videos'
import type { CreatorDto } from '@shared/dtos'
import type {
  MoveVideosToCreatorRequest,
  MoveVideosToCreatorResult,
  PaginatedResult
} from '@shared/types'

vi.mock('@/hooks/use-creators', () => ({
  useCreatorsPaginated: vi.fn()
}))
vi.mock('@/hooks/use-videos', () => ({
  useMoveVideosToCreator: vi.fn()
}))
vi.mock('@components/features/creators/RegisterCreatorDialog', () => ({
  RegisterCreatorDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="register-dialog" /> : null
}))

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args)
  }
}))

const tVideos = (key: string, params?: Record<string, unknown>): string =>
  i18n.t(key, { ns: 'videos', ...params })
const tCommon = (key: string): string => i18n.t(key, { ns: 'common' })

type MoveMutation = UseMutationResult<MoveVideosToCreatorResult, Error, MoveVideosToCreatorRequest>

function makeMutation(overrides: Partial<MoveMutation> = {}): MoveMutation {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isIdle: true,
    isError: false,
    isSuccess: false,
    status: 'idle',
    data: undefined,
    error: null,
    variables: undefined,
    reset: vi.fn(),
    ...overrides
  } as unknown as MoveMutation
}

const CREATORS: CreatorDto[] = [
  {
    id: 'c-1',
    name: 'Alice',
    folderName: 'alice',
    externalUrl: null,
    status: 'active'
  } as CreatorDto,
  {
    id: 'c-2',
    name: 'Bob',
    folderName: 'bob',
    externalUrl: null,
    status: 'active'
  } as CreatorDto
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useCreatorsPaginated).mockReturnValue({
    data: { data: CREATORS, total: 2, page: 1, pageSize: 500 },
    isSuccess: true,
    isLoading: false,
    isFetching: false,
    isError: false,
    isPending: false,
    error: null,
    status: 'success'
  } as unknown as UseQueryResult<PaginatedResult<CreatorDto>, Error>)
  vi.mocked(useMoveVideosToCreator).mockReturnValue(makeMutation())
})

describe('MoveToCreatorDialog', () => {
  it('renders the title with the selected count', () => {
    render(<MoveToCreatorDialog open onOpenChange={() => {}} videoIds={['v-1', 'v-2', 'v-3']} />)
    expect(screen.getByText(tVideos('move.title', { count: 3 }))).toBeInTheDocument()
  })

  it('Move is disabled until a target is picked', () => {
    render(<MoveToCreatorDialog open onOpenChange={() => {}} videoIds={['v-1']} />)
    expect(screen.getByRole('button', { name: tVideos('move.submit') })).toBeDisabled()
  })

  it('hides the parent creator from the picker when hideCreatorId is supplied', async () => {
    const user = userEvent.setup()
    render(
      <MoveToCreatorDialog open onOpenChange={() => {}} videoIds={['v-1']} hideCreatorId="c-1" />
    )

    await user.click(screen.getByRole('combobox'))
    const aliceOptions = screen
      .queryAllByText('Alice')
      .filter((el) => el.closest('[role="option"]'))
    expect(aliceOptions.length).toBe(0)

    const bobOptions = screen.queryAllByText('Bob').filter((el) => el.closest('[role="option"]'))
    expect(bobOptions.length).toBe(1)
  })

  it('submitting fires the move mutation with the request shape and toasts success', async () => {
    const mutate = vi.fn(
      (
        _vars: MoveVideosToCreatorRequest,
        opts?: { onSuccess?: (r: MoveVideosToCreatorResult) => void }
      ) =>
        opts?.onSuccess?.({
          moved: 2,
          skipped: 0,
          errors: {}
        })
    )
    vi.mocked(useMoveVideosToCreator).mockReturnValue(makeMutation({ mutate }))

    const onMoved = vi.fn()
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(
      <MoveToCreatorDialog
        open
        onOpenChange={onOpenChange}
        videoIds={['v-1', 'v-2']}
        onMoved={onMoved}
      />
    )

    await user.click(screen.getByRole('combobox'))
    const bob = screen.getAllByText('Bob').find((el) => el.closest('[role="option"]'))
    if (!bob) throw new Error('expected Bob option')
    await user.click(bob)

    await user.click(screen.getByRole('button', { name: tVideos('move.submit') }))

    expect(mutate).toHaveBeenCalledWith(
      { videoIds: ['v-1', 'v-2'], targetCreatorId: 'c-2' },
      expect.any(Object)
    )
    expect(toastSuccess).toHaveBeenCalledWith(
      tVideos('move.movedToast', { count: 2 }),
      expect.any(Object)
    )
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onMoved).toHaveBeenCalledTimes(1)
  })

  it('Cancel closes the dialog without firing the mutation', async () => {
    const mutate = vi.fn()
    vi.mocked(useMoveVideosToCreator).mockReturnValue(makeMutation({ mutate }))
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(<MoveToCreatorDialog open onOpenChange={onOpenChange} videoIds={['v-1']} />)

    await user.click(screen.getByRole('button', { name: tCommon('actions.cancel') }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(mutate).not.toHaveBeenCalled()
  })

  it('Register-new-creator button opens the RegisterCreatorDialog', async () => {
    const user = userEvent.setup()
    render(<MoveToCreatorDialog open onOpenChange={() => {}} videoIds={['v-1']} />)

    await user.click(screen.getByRole('button', { name: tVideos('move.registerNew') }))
    expect(screen.getByTestId('register-dialog')).toBeInTheDocument()
  })
})
