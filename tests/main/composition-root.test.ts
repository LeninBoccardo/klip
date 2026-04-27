import { describe, it, expect, vi, afterEach } from 'vitest'
import { createTestDb } from './helpers/createTestDb'
import type { DatabaseInstance } from '@main/framework-drivers/database'

// Stub the small subset of `electron` that the framework-drivers layer touches
// at construction time. Composition-root never calls runtime methods that would
// need a live BrowserWindow / Electron app.
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '/fake/app/path',
    getPath: () => '/fake/user/data',
    getVersion: () => '0.0.0-test'
  },
  BrowserWindow: { getAllWindows: () => [] },
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: { handle: vi.fn(), on: vi.fn() }
}))

import { createAppContainer } from '@main/composition-root'

describe('composition-root smoke test', () => {
  let database: DatabaseInstance | null = null

  afterEach(() => {
    // The container's shutdown() closes the DB; if a test bails before calling
    // it, close manually to release the file handle.
    if (database) {
      try {
        database.raw.close()
      } catch {
        /* already closed */
      }
      database = null
    }
  })

  it('wires every dependency declared on AppContainer with a non-null instance', () => {
    database = createTestDb()
    const container = createAppContainer({ database, rootPath: '/fake/root', isDev: true })

    // Repositories
    expect(container.repositories.creator).toBeDefined()
    expect(container.repositories.video).toBeDefined()
    expect(container.repositories.cut).toBeDefined()
    expect(container.repositories.settings).toBeDefined()
    expect(container.repositories.operation).toBeDefined()
    expect(container.repositories.auditLog).toBeDefined()

    // Ports
    expect(container.ports.fsReader).toBeDefined()
    expect(container.ports.fsWriter).toBeDefined()
    expect(container.ports.pathResolver).toBeDefined()
    expect(container.ports.transactionScope).toBeDefined()
    expect(container.ports.notifier).toBeDefined()
    expect(container.ports.debouncer).toBeDefined()
    expect(container.ports.binaryResolver).toBeDefined()
    expect(container.ports.videoDownloader).toBeDefined()
    expect(container.ports.mediaProbe).toBeDefined()
    expect(container.ports.downloadQueue).toBeDefined()
    expect(container.ports.idGenerator).toBeDefined()
    expect(container.ports.updater).toBeDefined()

    // Use cases
    expect(container.useCases.reconcile).toBeDefined()
    expect(container.useCases.processNotifications).toBeDefined()
    expect(container.useCases.fetchVideoInfo).toBeDefined()
    expect(container.useCases.downloadVideo).toBeDefined()
    expect(container.useCases.probeMediaFile).toBeDefined()
    expect(container.useCases.recoverOperations).toBeDefined()
    expect(container.useCases.enrichMedia).toBeDefined()
    expect(container.useCases.fetchChannelInfo).toBeDefined()
    expect(container.useCases.migrateRootFolder).toBeDefined()

    // Service + ref
    expect(container.services.fileWatcher).toBeDefined()
    expect(container.rootPathRef.value).toBe('/fake/root')

    // Cleanly tear down (closes DB, etc.).
    container.shutdown()
    database = null
  })

  it('returns the same DatabaseInstance that was passed in', () => {
    database = createTestDb()
    const container = createAppContainer({ database, rootPath: '/fake/root', isDev: true })

    expect(container.database).toBe(database)
    container.shutdown()
    database = null
  })

  it('exposes audited repositories for creator/video/cut (not the raw Sqlite ones)', () => {
    database = createTestDb()
    const container = createAppContainer({ database, rootPath: '/fake/root', isDev: true })

    // Audited decorators are named distinctly from raw repos; this guards
    // against a future regression where someone wires the raw repository.
    expect(container.repositories.creator.constructor.name).toBe('AuditedCreatorRepository')
    expect(container.repositories.video.constructor.name).toBe('AuditedVideoRepository')
    expect(container.repositories.cut.constructor.name).toBe('AuditedCutRepository')

    container.shutdown()
    database = null
  })
})
