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

  it('wires every dependency declared on AppContainer with a non-null instance of the right class', () => {
    database = createTestDb()
    const container = createAppContainer({ database, defaultRootPath: '/fake/root', isDev: true })

    // Asserting the constructor names (rather than just `.toBeDefined()`)
    // catches a regression that wires a null-returning getter or the wrong
    // concrete class — `.toBeDefined()` would happily pass for `{}` or the
    // raw Sqlite* repo where the audited decorator was expected.
    const expectedCtor = (obj: object, name: string): void =>
      expect(obj.constructor.name).toBe(name)

    // Repositories — audited decorators (not raw Sqlite repos) for the three
    // entity types that go through audit; raw for the rest.
    expectedCtor(container.repositories.creator, 'AuditedCreatorRepository')
    expectedCtor(container.repositories.video, 'AuditedVideoRepository')
    expectedCtor(container.repositories.cut, 'AuditedCutRepository')
    expectedCtor(container.repositories.settings, 'SqliteSettingsRepository')
    expectedCtor(container.repositories.operation, 'SqliteOperationRepository')
    expectedCtor(container.repositories.auditLog, 'SqliteAuditLogRepository')

    // Ports — concrete impls.
    expectedCtor(container.ports.fsReader, 'NodeFileSystemReader')
    expectedCtor(container.ports.fsWriter, 'NodeFileSystemWriter')
    expectedCtor(container.ports.pathResolver, 'NodePathResolver')
    expectedCtor(container.ports.transactionScope, 'SqliteTransactionScope')
    expectedCtor(container.ports.notifier, 'ElectronNotifier')
    expectedCtor(container.ports.debouncer, 'NodeDebouncer')
    expectedCtor(container.ports.binaryResolver, 'ElectronBinaryResolver')
    expectedCtor(container.ports.videoDownloader, 'YtDlpDownloader')
    expectedCtor(container.ports.mediaProbe, 'FfprobeMediaProbe')
    expectedCtor(container.ports.downloadQueue, 'PQueueDownloadQueue')
    expectedCtor(container.ports.idGenerator, 'NodeIdGenerator')
    // Dev mode swaps the real updater for the no-op DisabledUpdater
    // (composition-root.ts:224 — `isDev: true` is what this test passes in).
    expectedCtor(container.ports.updater, 'DisabledUpdater')

    // Use cases — pin to the concrete class names so a regression that
    // injects a stub or wraps with a decorator surfaces.
    expectedCtor(container.useCases.reconcile, 'ReconcileDirectory')
    expectedCtor(container.useCases.processNotifications, 'ProcessFileNotifications')
    expectedCtor(container.useCases.fetchVideoInfo, 'FetchVideoInfo')
    expectedCtor(container.useCases.downloadVideo, 'DownloadVideo')
    expectedCtor(container.useCases.probeMediaFile, 'ProbeMediaFile')
    expectedCtor(container.useCases.recoverOperations, 'RecoverOperations')
    expectedCtor(container.useCases.enrichMedia, 'EnrichMediaMetadata')
    expectedCtor(container.useCases.fetchChannelInfo, 'FetchChannelInfo')
    expectedCtor(container.useCases.migrateRootFolder, 'MigrateRootFolder')
    expectedCtor(container.useCases.resolveMediaUrl, 'ResolveMediaUrl')

    // Services + ref
    expectedCtor(container.services.fileWatcher, 'ChokidarWatcher')
    expectedCtor(container.services.klipMediaProtocol, 'KlipMediaProtocolHandler')
    expect(container.rootPathRef.value).toBe('/fake/root')

    // Cleanly tear down (closes DB, etc.).
    container.shutdown()
    database = null
  })

  it('returns the same DatabaseInstance that was passed in', () => {
    database = createTestDb()
    const container = createAppContainer({ database, defaultRootPath: '/fake/root', isDev: true })

    expect(container.database).toBe(database)
    container.shutdown()
    database = null
  })

  it('exposes audited repositories for creator/video/cut (not the raw Sqlite ones)', () => {
    database = createTestDb()
    const container = createAppContainer({ database, defaultRootPath: '/fake/root', isDev: true })

    // Audited decorators are named distinctly from raw repos; this guards
    // against a future regression where someone wires the raw repository.
    expect(container.repositories.creator.constructor.name).toBe('AuditedCreatorRepository')
    expect(container.repositories.video.constructor.name).toBe('AuditedVideoRepository')
    expect(container.repositories.cut.constructor.name).toBe('AuditedCutRepository')

    container.shutdown()
    database = null
  })
})
