import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RegisterCreator } from '@use-cases/RegisterCreator'
import {
  CreatorAlreadyRegisteredError,
  EmptyDisplayNameError,
  InvalidFolderNameError
} from '@use-cases/errors/RegisterCreatorErrors'
import type { ICreatorRepository } from '@domain/repositories'
import type { IFileSystemWriter, IPathResolver, RootPathRef, IIdGenerator } from '@domain/ports'
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
  let useCase: RegisterCreator

  beforeEach(() => {
    creatorRepo = mockCreatorRepo()
    fsWriter = mockFsWriter()
    pathResolver = mockPathResolver()
    idGenerator = mockIdGenerator('new-creator-id')
    rootPathRef = { value: '/root' }
    useCase = new RegisterCreator(creatorRepo, idGenerator, fsWriter, pathResolver, rootPathRef)
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

  it('still returns success when folder creation throws (warning logged)', async () => {
    vi.mocked(fsWriter.ensureDirectory).mockImplementation(() => {
      throw new Error('EACCES')
    })

    const result = await useCase.execute({
      channelInfo: baseChannelInfo,
      displayName: 'X',
      folderName: 'x',
      notes: null,
      tags: []
    })

    expect(result.creatorId).toBe('new-creator-id')
    expect(creatorRepo.upsertWithPrevious).toHaveBeenCalledTimes(1)
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
})
