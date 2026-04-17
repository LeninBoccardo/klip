import { mkdirSync, writeFileSync, renameSync, cpSync, rmSync, readdirSync } from 'fs'
import { dirname } from 'path'
import type { IFileSystemWriter } from '@domain/ports'

/**
 * Node.js `fs`-backed implementation of `IFileSystemWriter`.
 */
export class NodeFileSystemWriter implements IFileSystemWriter {
  ensureDirectory(dirPath: string): void {
    mkdirSync(dirPath, { recursive: true })
  }

  writeFile(filePath: string, content: string): void {
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, content, 'utf-8')
  }

  renameDirectory(oldPath: string, newPath: string): void {
    renameSync(oldPath, newPath)
  }

  moveDirectory(srcPath: string, destPath: string): void {
    try {
      // Fast path: same filesystem
      renameSync(srcPath, destPath)
    } catch {
      // Cross-device fallback: recursive copy then delete
      cpSync(srcPath, destPath, { recursive: true })
      rmSync(srcPath, { recursive: true, force: true })
    }
  }

  isDirectoryEmpty(dirPath: string): boolean {
    const entries = readdirSync(dirPath)
    return entries.length === 0
  }
}
