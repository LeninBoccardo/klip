/**
 * Abstraction over file-system write operations.
 * Separated from IFileSystemReader for SRP compliance.
 */
export interface IFileSystemWriter {
  /** Create a directory and any necessary parent directories */
  ensureDirectory(dirPath: string): void

  /** Write a UTF-8 string to a file, creating parent directories if needed */
  writeFile(filePath: string, content: string): void
}
