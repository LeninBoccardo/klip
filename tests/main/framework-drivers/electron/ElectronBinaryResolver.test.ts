import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { join } from 'path'

const mockApp = vi.hoisted(() => ({
  isPackaged: false,
  getAppPath: vi.fn(() => '/dev/project/root')
}))

vi.mock('electron', () => ({ app: mockApp }))

import { ElectronBinaryResolver } from '@main/framework-drivers/electron/ElectronBinaryResolver'

const ORIGINAL_PLATFORM = process.platform
const ORIGINAL_RESOURCES_PATH = (process as NodeJS.Process & { resourcesPath?: string })
  .resourcesPath

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
}

function setResourcesPath(path: string): void {
  Object.defineProperty(process, 'resourcesPath', { value: path, configurable: true })
}

beforeEach(() => {
  mockApp.isPackaged = false
  mockApp.getAppPath.mockReturnValue('/dev/project/root')
})

afterEach(() => {
  setPlatform(ORIGINAL_PLATFORM)
  if (ORIGINAL_RESOURCES_PATH !== undefined) {
    setResourcesPath(ORIGINAL_RESOURCES_PATH)
  }
})

describe('ElectronBinaryResolver — packaged', () => {
  beforeEach(() => {
    mockApp.isPackaged = true
    setResourcesPath('/Applications/Klip.app/Contents/Resources')
  })

  it('resolves yt-dlp under process.resourcesPath/bin/yt-dlp on darwin', () => {
    setPlatform('darwin')
    const resolver = new ElectronBinaryResolver()
    expect(resolver.resolve('yt-dlp')).toBe(
      join('/Applications/Klip.app/Contents/Resources', 'bin', 'yt-dlp')
    )
  })

  it('resolves yt-dlp under process.resourcesPath/bin/yt-dlp.exe on win32', () => {
    setPlatform('win32')
    setResourcesPath('C:\\Program Files\\Klip\\resources')
    const resolver = new ElectronBinaryResolver()
    // Use path-segment assertion to stay portable across path separators.
    expect(resolver.resolve('yt-dlp')).toMatch(/yt-dlp\.exe$/)
    expect(resolver.resolve('yt-dlp')).toMatch(/resources/)
  })

  it('resolves ffprobe with the .exe suffix on win32 and bare on linux', () => {
    setPlatform('win32')
    setResourcesPath('C:\\Klip\\resources')
    expect(new ElectronBinaryResolver().resolve('ffprobe')).toMatch(/ffprobe\.exe$/)

    setPlatform('linux')
    setResourcesPath('/usr/share/klip/resources')
    expect(new ElectronBinaryResolver().resolve('ffprobe')).toBe(
      join('/usr/share/klip/resources', 'bin', 'ffprobe')
    )
  })
})

describe('ElectronBinaryResolver — dev (not packaged)', () => {
  beforeEach(() => {
    mockApp.isPackaged = false
  })

  it('resolves under app.getAppPath()/resources/bin/<name>', () => {
    setPlatform('linux')
    mockApp.getAppPath.mockReturnValue('/dev/proj')
    expect(new ElectronBinaryResolver().resolve('yt-dlp')).toBe(
      join('/dev/proj', 'resources', 'bin', 'yt-dlp')
    )
  })

  it('still uses the .exe suffix on win32 in dev mode', () => {
    setPlatform('win32')
    mockApp.getAppPath.mockReturnValue('C:\\dev\\klip')
    expect(new ElectronBinaryResolver().resolve('ffprobe')).toMatch(/ffprobe\.exe$/)
  })
})

describe('ElectronBinaryResolver — platform fallback', () => {
  it('falls back to the linux binary name on an unsupported platform', () => {
    setPlatform('freebsd' as NodeJS.Platform)
    mockApp.getAppPath.mockReturnValue('/x/y')
    // Linux uses the bare name. The fallback should produce the same shape so
    // a future BSD/Solaris install doesn't accidentally pick up yt-dlp.exe.
    expect(new ElectronBinaryResolver().resolve('yt-dlp')).toBe(
      join('/x/y', 'resources', 'bin', 'yt-dlp')
    )
    expect(new ElectronBinaryResolver().resolve('ffprobe')).toBe(
      join('/x/y', 'resources', 'bin', 'ffprobe')
    )
  })
})
