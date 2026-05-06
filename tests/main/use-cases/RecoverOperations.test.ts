import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RecoverOperations } from '@use-cases/RecoverOperations'
import type { ICutRepository, IOperationRepository } from '@domain/repositories'
import type { IFileSystemReader, IFileSystemWriter, IPathResolver } from '@domain/ports'
import type { Operation } from '@domain/entities'

// ── Mock builders ──

function mockOperationRepo(overrides: Partial<IOperationRepository> = {}): IOperationRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockReturnValue(null),
    findByStatus: vi.fn().mockReturnValue([]),
    updateStatus: vi.fn(),
    updatePayload: vi.fn(),
    ...overrides
  }
}

function mockFsReader(overrides: Partial<IFileSystemReader> = {}): IFileSystemReader {
  return {
    directoryExists: vi.fn().mockReturnValue(false),
    fileExists: vi.fn().mockReturnValue(false),
    listDirectories: vi.fn().mockReturnValue([]),
    listFiles: vi.fn().mockReturnValue([]),
    readJsonFile: vi.fn().mockReturnValue(null),
    readTextFile: vi.fn().mockReturnValue(null),
    ...overrides
  }
}

function mockFsWriter(overrides: Partial<IFileSystemWriter> = {}): IFileSystemWriter {
  return {
    ensureDirectory: vi.fn(),
    writeFile: vi.fn(),
    renameDirectory: vi.fn(),
    moveDirectory: vi.fn(),
    deleteFile: vi.fn(),
    isDirectoryEmpty: vi.fn().mockReturnValue(true),
    ...overrides
  }
}

function mockCutRepo(overrides: Partial<ICutRepository> = {}): ICutRepository {
  return {
    findAll: vi.fn().mockReturnValue([]),
    findAllActive: vi.fn().mockReturnValue([]),
    findById: vi.fn().mockReturnValue(null),
    findByCreatorId: vi.fn().mockReturnValue([]),
    findIdsByCreator: vi.fn().mockReturnValue([]),
    findByVideoId: vi.fn().mockReturnValue([]),
    findByProbeStatus: vi.fn().mockReturnValue([]),
    getAllDistinctTags: vi.fn().mockReturnValue([]),
    findByTags: vi.fn().mockReturnValue([]),
    searchByTitle: vi.fn().mockReturnValue([]),
    upsert: vi.fn(),
    upsertWithPrevious: vi.fn(),
    updateStatus: vi.fn(),
    updateProbeStatus: vi.fn(),
    delete: vi.fn(),
    updateFilePathPrefix: vi.fn(),
    findPaginated: vi.fn(),
    count: vi.fn().mockReturnValue(0),
    sumDuration: vi.fn().mockReturnValue(0),
    sumFileSize: vi.fn().mockReturnValue(0),
    ...overrides
  } as ICutRepository
}

function mockPathResolver(): IPathResolver {
  return {
    join: vi.fn((...parts: string[]) => parts.join('/')),
    dirname: vi.fn((p: string) => p.split('/').slice(0, -1).join('/') || '/')
  }
}

function makeOperation(overrides: Partial<Operation> = {}): Operation {
  return {
    id: 'op-1',
    type: 'rename_folder',
    status: 'pending',
    payload: JSON.stringify({ oldPath: '/root/old', newPath: '/root/new' }),
    error: null,
    startedAt: null,
    completedAt: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides
  }
}

// ── Tests ──

describe('RecoverOperations', () => {
  let operationRepo: IOperationRepository
  let fsReader: IFileSystemReader
  let fsWriter: IFileSystemWriter
  let pathResolver: IPathResolver
  let cutRepo: ICutRepository
  let useCase: RecoverOperations

  beforeEach(() => {
    operationRepo = mockOperationRepo()
    fsReader = mockFsReader()
    fsWriter = mockFsWriter()
    pathResolver = mockPathResolver()
    cutRepo = mockCutRepo()
    useCase = new RecoverOperations(operationRepo, fsReader, fsWriter, pathResolver, cutRepo)
  })

  it('should return zero counts when no stale operations exist', () => {
    const result = useCase.execute()

    expect(result).toEqual({ completed: 0, rolledBack: 0, total: 0 })
    expect(operationRepo.findByStatus).toHaveBeenCalledWith('pending')
    expect(operationRepo.findByStatus).toHaveBeenCalledWith('in_progress')
  })

  // ── rename_folder recovery ──

  it('should mark rename_folder as completed when new path exists', () => {
    const op = makeOperation({
      id: 'op-rename-1',
      type: 'rename_folder',
      status: 'pending',
      payload: JSON.stringify({ oldPath: '/root/old-name', newPath: '/root/new-name' })
    })
    vi.mocked(operationRepo.findByStatus).mockImplementation((status) =>
      status === 'pending' ? [op] : []
    )
    vi.mocked(fsReader.directoryExists).mockImplementation((path) => path === '/root/new-name')

    const result = useCase.execute()

    expect(result).toEqual({ completed: 1, rolledBack: 0, total: 1 })
    expect(operationRepo.updateStatus).toHaveBeenCalledWith('op-rename-1', 'completed')
  })

  it('should mark rename_folder as rolled_back when old path still exists', () => {
    const op = makeOperation({
      id: 'op-rename-2',
      type: 'rename_folder',
      status: 'in_progress',
      payload: JSON.stringify({ oldPath: '/root/old-name', newPath: '/root/new-name' })
    })
    vi.mocked(operationRepo.findByStatus).mockImplementation((status) =>
      status === 'in_progress' ? [op] : []
    )
    vi.mocked(fsReader.directoryExists).mockImplementation((path) => path === '/root/old-name')

    const result = useCase.execute()

    expect(result).toEqual({ completed: 0, rolledBack: 1, total: 1 })
    expect(operationRepo.updateStatus).toHaveBeenCalledWith(
      'op-rename-2',
      'rolled_back',
      'Rename did not complete: old path still exists'
    )
  })

  it('should mark rename_folder as rolled_back when neither path exists', () => {
    const op = makeOperation({
      id: 'op-rename-3',
      type: 'rename_folder',
      status: 'pending',
      payload: JSON.stringify({ oldPath: '/root/old', newPath: '/root/new' })
    })
    vi.mocked(operationRepo.findByStatus).mockImplementation((status) =>
      status === 'pending' ? [op] : []
    )
    // directoryExists returns false for both (default mock)

    const result = useCase.execute()

    expect(result).toEqual({ completed: 0, rolledBack: 1, total: 1 })
    expect(operationRepo.updateStatus).toHaveBeenCalledWith(
      'op-rename-3',
      'rolled_back',
      'Neither old nor new path exists'
    )
  })

  it('should mark rename_folder as rolled_back when payload is missing paths', () => {
    const op = makeOperation({
      id: 'op-rename-4',
      type: 'rename_folder',
      status: 'pending',
      payload: JSON.stringify({})
    })
    vi.mocked(operationRepo.findByStatus).mockImplementation((status) =>
      status === 'pending' ? [op] : []
    )

    const result = useCase.execute()

    expect(result).toEqual({ completed: 0, rolledBack: 1, total: 1 })
    expect(operationRepo.updateStatus).toHaveBeenCalledWith(
      'op-rename-4',
      'rolled_back',
      'Missing oldPath or newPath in payload'
    )
  })

  it('should mark rename_folder as rolled_back when payload is malformed JSON', () => {
    const op = makeOperation({
      id: 'op-rename-5',
      type: 'rename_folder',
      status: 'pending',
      payload: 'not-valid-json'
    })
    vi.mocked(operationRepo.findByStatus).mockImplementation((status) =>
      status === 'pending' ? [op] : []
    )

    const result = useCase.execute()

    expect(result).toEqual({ completed: 0, rolledBack: 1, total: 1 })
    expect(operationRepo.updateStatus).toHaveBeenCalledWith(
      'op-rename-5',
      'rolled_back',
      'Failed to parse operation payload'
    )
  })

  // ── migrate_root recovery ──

  it('should physically move folders back from new root to old root for migrate_root', () => {
    const op = makeOperation({
      id: 'op-migrate-1',
      type: 'migrate_root',
      status: 'in_progress',
      payload: JSON.stringify({
        oldRoot: '/old/root',
        newRoot: '/new/root',
        folders: ['creator-a', 'creator-b', 'creator-c'],
        movedSoFar: ['creator-a', 'creator-b']
      })
    })
    vi.mocked(operationRepo.findByStatus).mockImplementation((status) =>
      status === 'in_progress' ? [op] : []
    )
    // Both moved folders are still at the new root
    vi.mocked(fsReader.directoryExists).mockReturnValue(true)

    const result = useCase.execute()

    expect(result).toEqual({ completed: 0, rolledBack: 1, total: 1 })
    expect(fsWriter.moveDirectory).toHaveBeenCalledTimes(2)
    expect(fsWriter.moveDirectory).toHaveBeenNthCalledWith(
      1,
      '/new/root/creator-a',
      '/old/root/creator-a'
    )
    expect(fsWriter.moveDirectory).toHaveBeenNthCalledWith(
      2,
      '/new/root/creator-b',
      '/old/root/creator-b'
    )
    expect(operationRepo.updateStatus).toHaveBeenCalledWith(
      'op-migrate-1',
      'rolled_back',
      'Root migration interrupted — folders moved back to original root'
    )
  })

  it('should skip folders no longer at new root during migrate_root rollback', () => {
    const op = makeOperation({
      id: 'op-migrate-skip',
      type: 'migrate_root',
      status: 'in_progress',
      payload: JSON.stringify({
        oldRoot: '/old/root',
        newRoot: '/new/root',
        folders: ['a', 'b'],
        movedSoFar: ['a', 'b']
      })
    })
    vi.mocked(operationRepo.findByStatus).mockImplementation((status) =>
      status === 'in_progress' ? [op] : []
    )
    // Only 'a' is still at the new root; 'b' has been manually moved already
    vi.mocked(fsReader.directoryExists).mockImplementation((p) => p === '/new/root/a')

    useCase.execute()

    expect(fsWriter.moveDirectory).toHaveBeenCalledTimes(1)
    expect(fsWriter.moveDirectory).toHaveBeenCalledWith('/new/root/a', '/old/root/a')
  })

  it('should record stranded folders in error message when individual moves fail', () => {
    const op = makeOperation({
      id: 'op-migrate-strand',
      type: 'migrate_root',
      status: 'in_progress',
      payload: JSON.stringify({
        oldRoot: '/old/root',
        newRoot: '/new/root',
        folders: ['a', 'b'],
        movedSoFar: ['a', 'b']
      })
    })
    vi.mocked(operationRepo.findByStatus).mockImplementation((status) =>
      status === 'in_progress' ? [op] : []
    )
    vi.mocked(fsReader.directoryExists).mockReturnValue(true)
    // First move succeeds, second throws
    let calls = 0
    vi.mocked(fsWriter.moveDirectory).mockImplementation(() => {
      calls++
      if (calls === 2) throw new Error('disk full')
    })

    useCase.execute()

    expect(operationRepo.updateStatus).toHaveBeenCalledWith(
      'op-migrate-strand',
      'rolled_back',
      'Root migration interrupted — folders moved back, but these are stranded at new root: b'
    )
  })

  it('should mark migrate_root rolled_back with malformed-payload message when fields are missing', () => {
    const op = makeOperation({
      id: 'op-migrate-bad',
      type: 'migrate_root',
      status: 'in_progress',
      payload: JSON.stringify({ movedSoFar: ['x'] }) // no oldRoot/newRoot
    })
    vi.mocked(operationRepo.findByStatus).mockImplementation((status) =>
      status === 'in_progress' ? [op] : []
    )

    useCase.execute()

    expect(fsWriter.moveDirectory).not.toHaveBeenCalled()
    expect(operationRepo.updateStatus).toHaveBeenCalledWith(
      'op-migrate-bad',
      'rolled_back',
      'Malformed migrate_root payload (missing oldRoot/newRoot/moves)'
    )
  })

  it('skips rolled-back entries in v2 payload and only re-rolls back moved entries (idempotent recovery)', () => {
    const op = makeOperation({
      id: 'op-migrate-v2',
      type: 'migrate_root',
      status: 'in_progress',
      payload: JSON.stringify({
        version: 2,
        oldRoot: '/old/root',
        newRoot: '/new/root',
        folders: ['a', 'b', 'c'],
        moves: [
          { folder: 'a', status: 'rolled-back' }, // already returned in a previous run
          { folder: 'b', status: 'moved' }, // pending
          { folder: 'c', status: 'moved' } // pending
        ]
      })
    })
    vi.mocked(operationRepo.findByStatus).mockImplementation((status) =>
      status === 'in_progress' ? [op] : []
    )
    vi.mocked(fsReader.directoryExists).mockReturnValue(true)

    useCase.execute()

    // Only the two pending entries get a moveDirectory call. The already-
    // rolled-back entry is skipped without re-attempting.
    expect(fsWriter.moveDirectory).toHaveBeenCalledTimes(2)
    expect(fsWriter.moveDirectory).toHaveBeenNthCalledWith(1, '/new/root/b', '/old/root/b')
    expect(fsWriter.moveDirectory).toHaveBeenNthCalledWith(2, '/new/root/c', '/old/root/c')
    expect(operationRepo.updateStatus).toHaveBeenCalledWith(
      'op-migrate-v2',
      'rolled_back',
      'Root migration interrupted — folders moved back to original root'
    )
  })

  it('persists per-folder status flip after each successful v2 rollback step', () => {
    const op = makeOperation({
      id: 'op-migrate-v2-persist',
      type: 'migrate_root',
      status: 'in_progress',
      payload: JSON.stringify({
        version: 2,
        oldRoot: '/old/root',
        newRoot: '/new/root',
        folders: ['a', 'b'],
        moves: [
          { folder: 'a', status: 'moved' },
          { folder: 'b', status: 'moved' }
        ]
      })
    })
    vi.mocked(operationRepo.findByStatus).mockImplementation((status) =>
      status === 'in_progress' ? [op] : []
    )
    vi.mocked(fsReader.directoryExists).mockReturnValue(true)

    useCase.execute()

    // Each successful rollback step persists the updated payload so a second
    // crash can resume without double-moving.
    const persists = vi.mocked(operationRepo.updatePayload).mock.calls
    expect(persists.length).toBeGreaterThanOrEqual(2)
    const finalPayload = JSON.parse(persists[persists.length - 1][1])
    expect(finalPayload.moves).toEqual([
      { folder: 'a', status: 'rolled-back' },
      { folder: 'b', status: 'rolled-back' }
    ])
  })

  it('should mark migrate_root rolled_back with parse-error message when payload is not JSON', () => {
    const op = makeOperation({
      id: 'op-migrate-parse',
      type: 'migrate_root',
      status: 'in_progress',
      payload: 'not-json'
    })
    vi.mocked(operationRepo.findByStatus).mockImplementation((status) =>
      status === 'in_progress' ? [op] : []
    )

    useCase.execute()

    expect(operationRepo.updateStatus).toHaveBeenCalledWith(
      'op-migrate-parse',
      'rolled_back',
      'Failed to parse migrate_root payload — manual cleanup required'
    )
  })

  // ── bulk_import recovery ──

  it('should always roll back bulk_import operations', () => {
    const op = makeOperation({
      id: 'op-import-1',
      type: 'bulk_import',
      status: 'pending',
      payload: JSON.stringify({ files: [] })
    })
    vi.mocked(operationRepo.findByStatus).mockImplementation((status) =>
      status === 'pending' ? [op] : []
    )

    const result = useCase.execute()

    expect(result).toEqual({ completed: 0, rolledBack: 1, total: 1 })
    expect(operationRepo.updateStatus).toHaveBeenCalledWith(
      'op-import-1',
      'rolled_back',
      'Bulk import interrupted — rolled back for safety'
    )
  })

  // ── Mixed operations ──

  it('should handle a mix of pending and in_progress operations', () => {
    const renameOp = makeOperation({
      id: 'op-r1',
      type: 'rename_folder',
      status: 'pending',
      payload: JSON.stringify({ oldPath: '/root/a', newPath: '/root/b' })
    })
    const migrateOp = makeOperation({
      id: 'op-m1',
      type: 'migrate_root',
      status: 'in_progress',
      payload: JSON.stringify({
        oldRoot: '/old/root',
        newRoot: '/new/root',
        folders: [],
        movedSoFar: []
      })
    })
    const importOp = makeOperation({
      id: 'op-i1',
      type: 'bulk_import',
      status: 'pending',
      payload: JSON.stringify({})
    })

    vi.mocked(operationRepo.findByStatus).mockImplementation((status) => {
      if (status === 'pending') return [renameOp, importOp]
      if (status === 'in_progress') return [migrateOp]
      return []
    })
    // new path for rename exists → completed
    vi.mocked(fsReader.directoryExists).mockImplementation((path) => path === '/root/b')

    const result = useCase.execute()

    expect(result).toEqual({ completed: 1, rolledBack: 2, total: 3 })
  })
})
