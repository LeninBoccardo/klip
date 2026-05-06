import { join } from 'path'
import { app } from 'electron'
import type { IBinaryResolver, ExternalBinary } from '@domain/ports'

type SupportedPlatform = 'win32' | 'darwin' | 'linux'

const BINARY_NAMES: Record<ExternalBinary, Record<SupportedPlatform, string>> = {
  'yt-dlp': { win32: 'yt-dlp.exe', darwin: 'yt-dlp', linux: 'yt-dlp' },
  ffprobe: { win32: 'ffprobe.exe', darwin: 'ffprobe', linux: 'ffprobe' },
  ffmpeg: { win32: 'ffmpeg.exe', darwin: 'ffmpeg', linux: 'ffmpeg' }
}

/**
 * Resolves external binary paths depending on whether the app is packaged or running in dev.
 *
 * - **Packaged:** `process.resourcesPath/bin/<binary>`
 * - **Dev:** `<project-root>/resources/bin/<binary>`
 */
export class ElectronBinaryResolver implements IBinaryResolver {
  resolve(name: ExternalBinary): string {
    const platform = process.platform as SupportedPlatform
    const platformMap = BINARY_NAMES[name]
    const fileName = platformMap[platform] ?? platformMap['linux']

    if (app.isPackaged) {
      return join(process.resourcesPath, 'bin', fileName)
    }

    // Dev: relative to project root (electron-vite sets __dirname to out/main/)
    return join(app.getAppPath(), 'resources', 'bin', fileName)
  }
}
