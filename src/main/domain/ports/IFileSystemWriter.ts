/**
 * Abstraction over file-system write operations.
 * Separated from IFileSystemReader for SRP compliance.
 */
export interface IFileSystemWriter {
  /** Create a directory and any necessary parent directories */
  ensureDirectory(dirPath: string): void

  /** Write a UTF-8 string to a file, creating parent directories if needed */
  writeFile(filePath: string, content: string): void

  /** Rename/move a directory from oldPath to newPath */
  renameDirectory(oldPath: string, newPath: string): void

  /** Move a directory from src to dest, working across drives (recursive copy + delete fallback) */
  moveDirectory(srcPath: string, destPath: string): void

  /**
   * Delete a single file. Idempotent — silently no-ops if the file does
   * not exist. Used by the editor's render-cleanup path (cancel / failure)
   * and by the operations-recovery sweep on next launch.
   */
  deleteFile(filePath: string): void

  /** Check if a directory is empty (no files, no subdirectories) */
  isDirectoryEmpty(dirPath: string): boolean

  /**
   * Remove a directory only if it is empty. Idempotent — silently no-ops
   * if the directory does not exist or is non-empty. Used by the editor's
   * render-cleanup paths (cancel / failure / recovery) to avoid leaving
   * orphan `<root>/<creator>/cuts/<cutId>/` shells behind that the next
   * reconcile would otherwise re-discover as phantom Cut rows.
   */
  removeDirectoryIfEmpty(dirPath: string): void
}
