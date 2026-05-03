/**
 * Typed errors for the MoveVideosToCreator use case. Mirrors the convention
 * used in RegisterCreatorErrors / TagErrors — `name` survives Electron's IPC
 * structured clone, so the renderer can pattern-match without relying on
 * message text.
 */

export const MOVE_VIDEOS_ERROR = {
  emptyVideoIds: 'MOVE_EMPTY_VIDEO_IDS',
  emptyTarget: 'MOVE_EMPTY_TARGET_CREATOR',
  targetNotFound: 'MOVE_TARGET_CREATOR_NOT_FOUND'
} as const

export class EmptyVideoIdsError extends Error {
  readonly name = 'EmptyVideoIdsError'
  constructor() {
    super(MOVE_VIDEOS_ERROR.emptyVideoIds)
  }
}

export class EmptyTargetCreatorError extends Error {
  readonly name = 'EmptyTargetCreatorError'
  constructor() {
    super(MOVE_VIDEOS_ERROR.emptyTarget)
  }
}

export class TargetCreatorNotFoundError extends Error {
  readonly name = 'TargetCreatorNotFoundError'
  constructor(public readonly creatorId: string) {
    super(`${MOVE_VIDEOS_ERROR.targetNotFound}:${creatorId}`)
  }
}
