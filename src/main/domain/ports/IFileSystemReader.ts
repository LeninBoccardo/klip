/**
 * Abstraction over file-system read operations.
 * Used by reconciliation use-cases to avoid direct `fs` imports.
 */
export interface IFileSystemReader {
  /** Returns true if the directory exists and is accessible */
  directoryExists(dirPath: string): boolean

  /** Returns true if the file exists and is accessible */
  fileExists(filePath: string): boolean

  /** Lists immediate subdirectory names (not full paths) under `dirPath`. Returns [] if dir doesn't exist. */
  listDirectories(dirPath: string): string[]

  /** Lists immediate file names (not full paths) under `dirPath`. Returns [] if dir doesn't exist. */
  listFiles(dirPath: string): string[]

  /** Reads a JSON file and returns the parsed object, or null if missing/malformed */
  readJsonFile<T = unknown>(filePath: string): T | null

  /** Reads a UTF-8 text file and returns its contents, or null if missing/unreadable */
  readTextFile(filePath: string): string | null
}
