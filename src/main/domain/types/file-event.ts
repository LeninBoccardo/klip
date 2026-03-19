/** Chokidar event types mapped to internal domain abstraction */
export type FileEventType = 'add' | 'addDir' | 'change' | 'unlink' | 'unlinkDir'

/** A file-system change notification */
export interface FileEvent {
  type: FileEventType
  path: string
}
