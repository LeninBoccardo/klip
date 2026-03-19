import { mkdirSync, writeFileSync } from 'fs'
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
}
