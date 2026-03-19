import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import type { IFileSystemReader } from '@domain/ports'

/**
 * Node.js `fs`-backed implementation of `IFileSystemReader`.
 * All operations are synchronous — suitable for reconciliation pipelines
 * that run inside a single SQLite transaction.
 */
export class NodeFileSystemReader implements IFileSystemReader {
  directoryExists(dirPath: string): boolean {
    try {
      return existsSync(dirPath) && statSync(dirPath).isDirectory()
    } catch {
      return false
    }
  }

  fileExists(filePath: string): boolean {
    try {
      return existsSync(filePath) && statSync(filePath).isFile()
    } catch {
      return false
    }
  }

  listDirectories(dirPath: string): string[] {
    try {
      if (!this.directoryExists(dirPath)) return []
      return readdirSync(dirPath, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    } catch {
      return []
    }
  }

  listFiles(dirPath: string): string[] {
    try {
      if (!this.directoryExists(dirPath)) return []
      return readdirSync(dirPath, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
    } catch {
      return []
    }
  }

  readJsonFile<T = unknown>(filePath: string): T | null {
    try {
      if (!this.fileExists(filePath)) return null
      const raw = readFileSync(filePath, 'utf-8')
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }
}
