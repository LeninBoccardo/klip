import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RecoverOperations } from '@use-cases/RecoverOperations'
import type { IOperationRepository } from '@domain/repositories'
import type { IFileSystemReader } from '@domain/ports'
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
  let useCase: RecoverOperations

  beforeEach(() => {
    operationRepo = mockOperationRepo()
    fsReader = mockFsReader()
    useCase = new RecoverOperations(operationRepo, fsReader)
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

  it('should always roll back migrate_root operations', () => {
    const op = makeOperation({
      id: 'op-migrate-1',
      type: 'migrate_root',
      status: 'in_progress',
      payload: JSON.stringify({ movedSoFar: ['creator-a'] })
    })
    vi.mocked(operationRepo.findByStatus).mockImplementation((status) =>
      status === 'in_progress' ? [op] : []
    )

    const result = useCase.execute()

    expect(result).toEqual({ completed: 0, rolledBack: 1, total: 1 })
    expect(operationRepo.updateStatus).toHaveBeenCalledWith(
      'op-migrate-1',
      'rolled_back',
      'Root migration interrupted — rolled back for safety'
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
      payload: JSON.stringify({})
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
