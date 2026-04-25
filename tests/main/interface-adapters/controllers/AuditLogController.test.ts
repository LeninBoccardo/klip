import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IAuditLogRepository } from '@domain/repositories'
import type { AuditEntry } from '@domain/entities'

const electron = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
  return {
    handlers,
    ipcMain: {
      handle: vi.fn((channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
        handlers.set(channel, handler)
      }),
      on: vi.fn()
    }
  }
})

vi.mock('electron', () => ({ ipcMain: electron.ipcMain }))

import { registerAuditLogController } from '@main/interface-adapters/controllers/AuditLogController'

function makeRepo(): IAuditLogRepository {
  return {
    append: vi.fn(),
    findByEntity: vi.fn().mockReturnValue([]),
    findRecent: vi.fn().mockReturnValue([])
  }
}

async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = electron.handlers.get(channel)
  if (!handler) throw new Error(`No handler for "${channel}"`)
  return (await handler({}, ...args)) as T
}

describe('AuditLogController', () => {
  beforeEach(() => {
    electron.handlers.clear()
    electron.ipcMain.handle.mockClear()
  })

  it('registers both audit log channels', () => {
    registerAuditLogController(makeRepo())
    expect([...electron.handlers.keys()].sort()).toEqual(
      ['get-audit-log-by-entity', 'get-audit-log-recent'].sort()
    )
  })

  it('"get-audit-log-by-entity" forwards entityType + entityId and maps entries to DTOs', async () => {
    const repo = makeRepo()
    const entry: AuditEntry = {
      id: 42,
      entityType: 'creator',
      entityId: 'creator-1',
      action: 'created',
      changes: null,
      createdAt: '2025-01-01T00:00:00.000Z'
    }
    vi.mocked(repo.findByEntity).mockReturnValue([entry])
    registerAuditLogController(repo)

    const result = await invoke<unknown[]>('get-audit-log-by-entity', 'creator', 'creator-1')

    expect(repo.findByEntity).toHaveBeenCalledWith('creator', 'creator-1')
    expect(result).toEqual([
      {
        id: 42,
        entityType: 'creator',
        entityId: 'creator-1',
        action: 'created',
        changes: null,
        createdAt: '2025-01-01T00:00:00.000Z'
      }
    ])
  })

  it('"get-audit-log-recent" forwards limit', async () => {
    const repo = makeRepo()
    registerAuditLogController(repo)
    await invoke('get-audit-log-recent', 50)
    expect(repo.findRecent).toHaveBeenCalledWith(50)
  })
})
