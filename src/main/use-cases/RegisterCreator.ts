import type { Creator } from '@domain/entities'
import type { ICreatorRepository } from '@domain/repositories'
import type {
  IFileSystemWriter,
  IPathResolver,
  RootPathRef,
  IIdGenerator,
  ITransactionScope
} from '@domain/ports'
import { slugify } from '@domain/types'
import type { RegisterCreatorRequest, RegisterCreatorResult } from '@shared/types'
import type { IRegisterCreator } from './IRegisterCreator'
import {
  CreatorAlreadyRegisteredError,
  EmptyDisplayNameError,
  FolderNameTakenError,
  InvalidFolderNameError
} from './errors/RegisterCreatorErrors'

const MAX_NOTES_LENGTH = 5000
const MAX_TAGS = 64
const MAX_TAG_LENGTH = 64
const FOLDER_NAME_PATTERN = /^[a-z0-9-]+$/

/**
 * Creates a brand-new Creator from a fetched ChannelInfo plus user-supplied
 * overrides. Persists the row, then ensures the on-disk folder exists. The
 * disk step runs after the DB write — if the folder fails to materialise,
 * the creator is still registered and reconciliation/the next download can
 * recover the directory.
 *
 * Distinct from FetchChannelInfo, which only enriches *existing* creators
 * matched by channelId or slugified name.
 *
 * Concurrency: the find→insert pair runs inside an ITransactionScope, and the
 * `creators` table backs the uniqueness with a UNIQUE constraint on
 * `folder_name` plus a partial UNIQUE index on `youtube_channel_id` (NOT NULL).
 * If two callers race past the in-memory check, the DB rejects the second
 * insert and the catch translates SQLITE_CONSTRAINT_UNIQUE into the same
 * typed error a pre-check loser would have seen.
 */
export class RegisterCreator implements IRegisterCreator {
  constructor(
    private creatorRepo: ICreatorRepository,
    private idGenerator: IIdGenerator,
    private fsWriter: IFileSystemWriter,
    private pathResolver: IPathResolver,
    private rootPathRef: RootPathRef,
    private transaction: ITransactionScope
  ) {}

  async execute(input: RegisterCreatorRequest): Promise<RegisterCreatorResult> {
    const displayName = input.displayName.trim()
    if (displayName.length === 0) throw new EmptyDisplayNameError()

    const folderName = input.folderName.trim()
    if (!FOLDER_NAME_PATTERN.test(folderName) || folderName !== slugify(folderName)) {
      throw new InvalidFolderNameError(folderName)
    }

    const tags = normalizeTags(input.tags)
    const notes = normalizeNotes(input.notes)
    const channelId = input.channelInfo.channelId || null

    const now = new Date().toISOString()
    const creator: Creator = {
      id: this.idGenerator.generate(),
      folderName,
      name: displayName,
      profileImagePath: null,
      youtubeChannelId: channelId,
      youtubeChannelUrl: input.channelInfo.channelUrl ?? null,
      subscriberCount: input.channelInfo.subscriberCount ?? null,
      avatarUrl: input.channelInfo.avatarUrl ?? null,
      notes,
      tags,
      status: 'active',
      deletedAt: null,
      createdAt: now,
      updatedAt: now
    }

    try {
      this.transaction.run(() => {
        if (channelId) {
          const existing = this.creatorRepo.findByYoutubeChannelId(channelId)
          if (existing) throw new CreatorAlreadyRegisteredError(existing.id)
        }
        if (this.creatorRepo.findByFolderName(folderName)) {
          throw new FolderNameTakenError(folderName)
        }
        this.creatorRepo.upsertWithPrevious(creator, null)
      })
    } catch (err) {
      // A race-loser's pre-check passes but the DB UNIQUE constraint fires on
      // insert. Re-query and translate to the same typed error a pre-check
      // loser would have produced, so callers see one error shape regardless
      // of which path lost the race.
      if (isUniqueConstraintError(err, 'creators.youtube_channel_id') && channelId) {
        const existing = this.creatorRepo.findByYoutubeChannelId(channelId)
        if (existing) throw new CreatorAlreadyRegisteredError(existing.id)
      }
      if (isUniqueConstraintError(err, 'creators.folder_name')) {
        throw new FolderNameTakenError(folderName)
      }
      throw err
    }

    // Folder creation is best-effort: a failure here shouldn't roll back the
    // DB row. Reconcile (or the next download) will recreate the directory.
    try {
      const dir = this.pathResolver.join(this.rootPathRef.value, folderName)
      this.fsWriter.ensureDirectory(dir)
    } catch (err) {
      console.warn(
        `[RegisterCreator] Folder creation failed for "${folderName}":`,
        err instanceof Error ? err.message : err
      )
    }

    return { creatorId: creator.id }
  }
}

function normalizeTags(input: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input) {
    const t = raw.trim().slice(0, MAX_TAG_LENGTH)
    if (t.length === 0 || seen.has(t)) continue
    seen.add(t)
    out.push(t)
    if (out.length >= MAX_TAGS) break
  }
  return out
}

function normalizeNotes(input: string | null): string | null {
  if (input === null) return null
  const trimmed = input.trim()
  if (trimmed.length === 0) return null
  return trimmed.slice(0, MAX_NOTES_LENGTH)
}

function isUniqueConstraintError(err: unknown, columnSuffix: string): boolean {
  if (!(err instanceof Error)) return false
  const code = (err as { code?: string }).code
  if (code !== 'SQLITE_CONSTRAINT_UNIQUE') return false
  return err.message.includes(columnSuffix)
}
