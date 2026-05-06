import { mkdirSync, writeFileSync, renameSync, cpSync, rmSync, readdirSync, unlinkSync } from 'fs'
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

  deleteFile(filePath: string): void {
    try {
      unlinkSync(filePath)
    } catch (err) {
      // Idempotent — only swallow ENOENT, surface anything else (a
      // permission error here would silently strand orphan files).
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
      throw err
    }
  }

  isDirectoryEmpty(dirPath: string): boolean {
    const entries = readdirSync(dirPath)
    return entries.length === 0
  }
}
