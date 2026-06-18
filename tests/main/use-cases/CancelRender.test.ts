import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CancelRender } from '@use-cases/CancelRender'
import type { IEditorSessionStore } from '@domain/ports'

function mockSessions(overrides: Partial<IEditorSessionStore> = {}): IEditorSessionStore {
  return {
    open: vi.fn(),
    get: vi.fn().mockReturnValue(null),
    getAbortController: vi.fn().mockReturnValue(null),
    update: vi.fn(),
    finalize: vi.fn(),
    list: vi.fn().mockReturnValue([]),
    remove: vi.fn(),
    ...overrides
  } as unknown as IEditorSessionStore
}

describe('CancelRender', () => {
  let sessions: IEditorSessionStore
  let useCase: CancelRender

  beforeEach(() => {
    sessions = mockSessions()
    useCase = new CancelRender(sessions)
  })

  it('looks up the AbortController by jobId', async () => {
    await useCase.execute('job-1')

    expect(sessions.getAbortController).toHaveBeenCalledWith('job-1')
    expect(sessions.getAbortController).toHaveBeenCalledTimes(1)
  })

  it('is a no-op when no controller is registered for the job', async () => {
    sessions = mockSessions({ getAbortController: vi.fn().mockReturnValue(null) })
    useCase = new CancelRender(sessions)

    // Should resolve without throwing.
    await expect(useCase.execute('missing-job')).resolves.toBeUndefined()
    expect(sessions.getAbortController).toHaveBeenCalledWith('missing-job')
  })

  it('aborts an in-flight controller whose signal has not yet fired', async () => {
    const controller = new AbortController()
    expect(controller.signal.aborted).toBe(false)
    sessions = mockSessions({ getAbortController: vi.fn().mockReturnValue(controller) })
    useCase = new CancelRender(sessions)

    await useCase.execute('job-2')

    expect(controller.signal.aborted).toBe(true)
  })

  it('does not re-abort a controller whose signal is already aborted (idempotent)', async () => {
    const controller = new AbortController()
    controller.abort()
    expect(controller.signal.aborted).toBe(true)
    const abortSpy = vi.spyOn(controller, 'abort')
    sessions = mockSessions({ getAbortController: vi.fn().mockReturnValue(controller) })
    useCase = new CancelRender(sessions)

    await useCase.execute('job-3')

    expect(abortSpy).not.toHaveBeenCalled()
    expect(controller.signal.aborted).toBe(true)
  })

  it('calls abort exactly once on a fresh controller', async () => {
    const controller = new AbortController()
    const abortSpy = vi.spyOn(controller, 'abort')
    sessions = mockSessions({ getAbortController: vi.fn().mockReturnValue(controller) })
    useCase = new CancelRender(sessions)

    await useCase.execute('job-4')

    expect(abortSpy).toHaveBeenCalledTimes(1)
  })

  it('is safe to call repeatedly for the same job (second call sees aborted signal)', async () => {
    const controller = new AbortController()
    const abortSpy = vi.spyOn(controller, 'abort')
    sessions = mockSessions({ getAbortController: vi.fn().mockReturnValue(controller) })
    useCase = new CancelRender(sessions)

    await useCase.execute('job-5')
    await useCase.execute('job-5')

    // First call aborts; second call short-circuits on the already-aborted guard.
    expect(abortSpy).toHaveBeenCalledTimes(1)
    expect(controller.signal.aborted).toBe(true)
  })
})
