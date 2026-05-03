import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RegisterCreator } from '@use-cases/RegisterCreator'
import {
  CreatorAlreadyRegisteredError,
  EmptyDisplayNameError,
  FolderNameTakenError,
  InvalidFolderNameError
} from '@use-cases/errors/RegisterCreatorErrors'
import type { ICreatorRepository } from '@domain/repositories'
import type {
  IFileSystemWriter,
  IPathResolver,
  RootPathRef,
  IIdGenerator,
  ITransactionScope
} from '@domain/ports'
import type { ChannelInfo } from '@domain/types'
import type { Creator } from '@domain/entities'

function mockCreatorRepo(): ICreatorRepository {
  return {
    findAll: vi.fn().mockReturnValue([]),
    findAllActive: vi.fn().mockReturnValue([]),
    findById: vi.fn().mockReturnValue(null),
    findByFolderName: vi.fn().mockReturnValue(null),
    findByYoutubeChannelId: vi.fn().mockReturnValue(null),
    searchByName: vi.fn().mockReturnValue([]),
    upsert: vi.fn(),
    upsertWithPrevious: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
    findPaginated: vi.fn()
  }
}

function mockFsWriter(): IFileSystemWriter {
  return {
    ensureDirectory: vi.fn(),
    writeFile: vi.fn(),
    renameDirectory: vi.fn(),
    moveDirectory: vi.fn(),
    isDirectoryEmpty: vi.fn().mockReturnValue(true)
  }
}

function mockPathResolver(): IPathResolver {
  return {
    join: vi.fn((...segments: string[]) => segments.join('/')),
    dirname: vi.fn()
  }
}

function mockIdGenerator(value = 'generated-id'): IIdGenerator {
  return { generate: vi.fn().mockReturnValue(value) }
}

function passthroughTransaction(): ITransactionScope {
  return { run: vi.fn(<T>(fn: () => T): T => fn()) }
}

const baseChannelInfo: ChannelInfo = {
  channelId: 'UC_abc123',
  channelName: 'Test Creator',
  channelUrl: 'https://youtube.com/channel/UC_abc123',
  uploaderUrl: 'https://youtube.com/@testcreator',
  subscriberCount: 50000,
  avatarUrl: 'https://example.com/avatar.jpg'
}

function makeExistingCreator(overrides: Partial<Creator> = {}): Creator {
  return {
    id: 'existing-id',
    folderName: 'existing-folder',
    name: 'Existing Creator',
    profileImagePath: null,
    youtubeChannelId: 'UC_abc123',
    youtubeChannelUrl: null,
    subscriberCount: null,
    avatarUrl: null,
    notes: null,
    tags: [],
    status: 'active',
    deletedAt: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides
  }
}

describe('RegisterCreator', () => {
  let creatorRepo: ICreatorRepository
  let fsWriter: IFileSystemWriter
  let pathResolver: IPathResolver
  let idGenerator: IIdGenerator
  let rootPathRef: RootPathRef
  let transaction: ITransactionScope
  let useCase: RegisterCreator

  beforeEach(() => {
    creatorRepo = mockCreatorRepo()
    fsWriter = mockFsWriter()
    pathResolver = mockPathResolver()
    idGenerator = mockIdGenerator('new-creator-id')
    rootPathRef = { value: '/root' }
    transaction = passthroughTransaction()
    useCase = new RegisterCreator(
      creatorRepo,
      idGenerator,
      fsWriter,
      pathResolver,
      rootPathRef,
      transaction
    )
  })

  it('persists a new creator with notes and tags and creates the on-disk folder', async () => {
    const result = await useCase.execute({
      channelInfo: baseChannelInfo,
      displayName: 'My Creator',
      folderName: 'my-creator',
      notes: 'A great channel',
      tags: ['vlog', 'tech']
    })

    expect(result).toEqual({ creatorId: 'new-creator-id' })
    expect(creatorRepo.upsertWithPrevious).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'new-creator-id',
        folderName: 'my-creator',
        name: 'My Creator',
        youtubeChannelId: 'UC_abc123',
        youtubeChannelUrl: 'https://youtube.com/channel/UC_abc123',
        subscriberCount: 50000,
        avatarUrl: 'https://example.com/avatar.jpg',
        notes: 'A great channel',
        tags: ['vlog', 'tech'],
        status: 'active',
        deletedAt: null,
        profileImagePath: null
      }),
      null
    )
    expect(fsWriter.ensureDirectory).toHaveBeenCalledWith('/root/my-creator')
  })

  it('throws CreatorAlreadyRegisteredError carrying the existing id', async () => {
    vi.mocked(creatorRepo.findByYoutubeChannelId).mockReturnValue(makeExistingCreator())

    await expect(
      useCase.execute({
        channelInfo: baseChannelInfo,
        displayName: 'Whatever',
        folderName: 'whatever',
        notes: null,
        tags: []
      })
    ).rejects.toMatchObject({
      name: 'CreatorAlreadyRegisteredError',
      existingCreatorId: 'existing-id'
    })

    expect(creatorRepo.upsertWithPrevious).not.toHaveBeenCalled()
    expect(fsWriter.ensureDirectory).not.toHaveBeenCalled()
  })

  it('treats a soft-deleted match as already registered', async () => {
    vi.mocked(creatorRepo.findByYoutubeChannelId).mockReturnValue(
      makeExistingCreator({ status: 'deleted', deletedAt: '2025-06-01T00:00:00.000Z' })
    )

    await expect(
      useCase.execute({
        channelInfo: baseChannelInfo,
        displayName: 'Whatever',
        folderName: 'whatever',
        notes: null,
        tags: []
      })
    ).rejects.toBeInstanceOf(CreatorAlreadyRegisteredError)
  })

  it('throws FolderNameTakenError when folder collides', async () => {
    vi.mocked(creatorRepo.findByFolderName).mockReturnValue(
      makeExistingCreator({ folderName: 'taken' })
    )

    await expect(
      useCase.execute({
        channelInfo: baseChannelInfo,
        displayName: 'Whatever',
        folderName: 'taken',
        notes: null,
        tags: []
      })
    ).rejects.toMatchObject({ name: 'FolderNameTakenError', folderName: 'taken' })

    expect(creatorRepo.upsertWithPrevious).not.toHaveBeenCalled()
  })

  it('throws InvalidFolderNameError for non-slug input', async () => {
    await expect(
      useCase.execute({
        channelInfo: baseChannelInfo,
        displayName: 'Whatever',
        folderName: 'Has Spaces',
        notes: null,
        tags: []
      })
    ).rejects.toBeInstanceOf(InvalidFolderNameError)
  })

  it('throws EmptyDisplayNameError when display name is whitespace', async () => {
    await expect(
      useCase.execute({
        channelInfo: baseChannelInfo,
        displayName: '   ',
        folderName: 'whatever',
        notes: null,
        tags: []
      })
    ).rejects.toBeInstanceOf(EmptyDisplayNameError)
  })

  it('normalizes tags: trims, drops empties, dedupes, caps length and count', async () => {
    const tags = [
      '  vlog  ',
      'vlog', // duplicate after trim
      '',
      '   ',
      'tech',
      'a'.repeat(100), // capped to 64 chars
      ...Array.from({ length: 100 }, (_, i) => `tag-${i}`) // pushes past max
    ]

    await useCase.execute({
      channelInfo: baseChannelInfo,
      displayName: 'X',
      folderName: 'x',
      notes: null,
      tags
    })

    const persisted = vi.mocked(creatorRepo.upsertWithPrevious).mock.calls[0][0]
    expect(persisted.tags.length).toBe(64)
    expect(persisted.tags[0]).toBe('vlog')
    expect(persisted.tags[1]).toBe('tech')
    expect(persisted.tags[2]).toBe('a'.repeat(64))
    // first 3 + 61 of the tag-N entries
    expect(persisted.tags[3]).toBe('tag-0')
  })

  it('coerces empty notes to null', async () => {
    await useCase.execute({
      channelInfo: baseChannelInfo,
      displayName: 'X',
      folderName: 'x',
      notes: '   ',
      tags: []
    })

    const persisted = vi.mocked(creatorRepo.upsertWithPrevious).mock.calls[0][0]
    expect(persisted.notes).toBeNull()
  })

  it('still returns success when folder creation throws, and surfaces the error to console.warn', async () => {
    vi.mocked(fsWriter.ensureDirectory).mockImplementation(() => {
      throw new Error('EACCES')
    })

    // Spy *before* execute(): a silent swallow would let this test pass even
    // if the code lost the console.warn — without the assertion, a future
    // refactor could drop the log and we'd never notice. Reconcile is the
    // safety net for missing folders, but operators still need a visible
    // signal that the FS write failed.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await useCase.execute({
      channelInfo: baseChannelInfo,
      displayName: 'X',
      folderName: 'x',
      notes: null,
      tags: []
    })

    expect(result.creatorId).toBe('new-creator-id')
    expect(creatorRepo.upsertWithPrevious).toHaveBeenCalledTimes(1)

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toMatch(/Folder creation failed for "x"/)
    // The error message must travel into the log so devs can diagnose
    // permission issues without re-running with extra instrumentation.
    expect(warnSpy.mock.calls[0]).toEqual(
      expect.arrayContaining([expect.stringContaining('EACCES')])
    )

    warnSpy.mockRestore()
  })

  it('skips channelId duplicate check when channelInfo.channelId is empty', async () => {
    await useCase.execute({
      channelInfo: { ...baseChannelInfo, channelId: '' },
      displayName: 'X',
      folderName: 'x',
      notes: null,
      tags: []
    })

    expect(creatorRepo.findByYoutubeChannelId).not.toHaveBeenCalled()
    expect(creatorRepo.upsertWithPrevious).toHaveBeenCalled()
  })

  it('runs the find→insert pair inside a transaction', async () => {
    await useCase.execute({
      channelInfo: baseChannelInfo,
      displayName: 'X',
      folderName: 'x',
      notes: null,
      tags: []
    })

    expect(transaction.run).toHaveBeenCalledTimes(1)
  })

  it('translates a youtube_channel_id UNIQUE constraint failure into CreatorAlreadyRegisteredError', async () => {
    // Simulate the race-loser path: the pre-check finds nothing (the winner
    // hasn't committed yet), but the insert collides with the partial UNIQUE
    // index. After the constraint fires, the row is visible — the use case
    // re-queries and surfaces the existing id.
    const winner = makeExistingCreator({ id: 'winner-id' })
    let queryCount = 0
    vi.mocked(creatorRepo.findByYoutubeChannelId).mockImplementation(() => {
      queryCount += 1
      // First call: pre-check inside the transaction, returns null.
      // Second call: post-failure re-query, returns the winner.
      return queryCount === 1 ? null : winner
    })
    const constraintErr = Object.assign(
      new Error('UNIQUE constraint failed: creators.youtube_channel_id'),
      { code: 'SQLITE_CONSTRAINT_UNIQUE' }
    )
    vi.mocked(creatorRepo.upsertWithPrevious).mockImplementation(() => {
      throw constraintErr
    })

    await expect(
      useCase.execute({
        channelInfo: baseChannelInfo,
        displayName: 'X',
        folderName: 'x',
        notes: null,
        tags: []
      })
    ).rejects.toMatchObject({
      name: 'CreatorAlreadyRegisteredError',
      existingCreatorId: 'winner-id'
    })
    expect(fsWriter.ensureDirectory).not.toHaveBeenCalled()
  })

  it('translates a folder_name UNIQUE constraint failure into FolderNameTakenError', async () => {
    const constraintErr = Object.assign(
      new Error('UNIQUE constraint failed: creators.folder_name'),
      { code: 'SQLITE_CONSTRAINT_UNIQUE' }
    )
    vi.mocked(creatorRepo.upsertWithPrevious).mockImplementation(() => {
      throw constraintErr
    })

    await expect(
      useCase.execute({
        channelInfo: baseChannelInfo,
        displayName: 'X',
        folderName: 'taken',
        notes: null,
        tags: []
      })
    ).rejects.toBeInstanceOf(FolderNameTakenError)
    expect(fsWriter.ensureDirectory).not.toHaveBeenCalled()
  })

  it('rethrows non-UNIQUE SQLite errors without translation', async () => {
    const otherErr = Object.assign(new Error('database disk image is malformed'), {
      code: 'SQLITE_CORRUPT'
    })
    vi.mocked(creatorRepo.upsertWithPrevious).mockImplementation(() => {
      throw otherErr
    })

    await expect(
      useCase.execute({
        channelInfo: baseChannelInfo,
        displayName: 'X',
        folderName: 'x',
        notes: null,
        tags: []
      })
    ).rejects.toBe(otherErr)
  })
})
