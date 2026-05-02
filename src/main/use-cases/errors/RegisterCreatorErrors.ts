/**
 * Typed errors for the RegisterCreator use case.
 *
 * `name` is preserved across Electron's IPC structured clone, so the renderer
 * can pattern-match on `err.name` to render the right toast/affordance. The
 * `message` carries an `ERROR_CODE:payload` shape that the renderer parses to
 * recover structured data (e.g. the existing creator id for "View existing").
 */

export const REGISTER_CREATOR_ERROR = {
  alreadyRegistered: 'CREATOR_ALREADY_REGISTERED',
  folderTaken: 'FOLDER_NAME_TAKEN',
  invalidFolderName: 'INVALID_FOLDER_NAME',
  emptyDisplayName: 'EMPTY_DISPLAY_NAME'
} as const

export class CreatorAlreadyRegisteredError extends Error {
  readonly name = 'CreatorAlreadyRegisteredError'
  constructor(public readonly existingCreatorId: string) {
    super(`${REGISTER_CREATOR_ERROR.alreadyRegistered}:${existingCreatorId}`)
  }
}

export class FolderNameTakenError extends Error {
  readonly name = 'FolderNameTakenError'
  constructor(public readonly folderName: string) {
    super(`${REGISTER_CREATOR_ERROR.folderTaken}:${folderName}`)
  }
}

export class InvalidFolderNameError extends Error {
  readonly name = 'InvalidFolderNameError'
  constructor(public readonly folderName: string) {
    super(`${REGISTER_CREATOR_ERROR.invalidFolderName}:${folderName}`)
  }
}

export class EmptyDisplayNameError extends Error {
  readonly name = 'EmptyDisplayNameError'
  constructor() {
    super(REGISTER_CREATOR_ERROR.emptyDisplayName)
  }
}
