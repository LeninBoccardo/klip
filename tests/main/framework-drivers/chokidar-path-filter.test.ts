import { describe, it, expect } from 'vitest'
import {
  isRelevantPath,
  isCreatorDir
} from '@main/framework-drivers/file-system/chokidar-path-filter'

// The watcher emits ~10x the events we care about during heavy disk activity
// (downloads, reconciles). The filter is the gate that keeps the notification
// queue from drowning in irrelevant paths. Run on both POSIX-style and
// Windows-style separators because chokidar emits the host platform's flavor.

const ROOT = 'C:/library'

describe('isRelevantPath — file events', () => {
  it('accepts a creator.json under a creator dir', () => {
    expect(isRelevantPath('C:/library/Creator/creator.json', ROOT, 'add')).toBe(true)
    expect(isRelevantPath('C:/library/Creator/creator.json', ROOT, 'change')).toBe(true)
  })

  it('accepts a media file under downloads/<videoId>/', () => {
    expect(isRelevantPath('C:/library/Creator/downloads/abc/file.mp4', ROOT, 'add')).toBe(true)
    expect(isRelevantPath('C:/library/Creator/downloads/abc/thumb.webp', ROOT, 'change')).toBe(true)
  })

  it('accepts a media file under cuts/<cutId>/', () => {
    expect(isRelevantPath('C:/library/Creator/cuts/cut-1/clip.mkv', ROOT, 'add')).toBe(true)
    expect(isRelevantPath('C:/library/Creator/cuts/cut-1/cut-data.json', ROOT, 'change')).toBe(true)
  })

  it('accepts meta.json sidecar inside a video folder', () => {
    expect(isRelevantPath('C:/library/Creator/downloads/abc/meta.json', ROOT, 'change')).toBe(true)
  })

  it('rejects a random text file at the root', () => {
    expect(isRelevantPath('C:/library/random.txt', ROOT, 'add')).toBe(false)
  })

  it('rejects a media file directly under a creator dir (skips the cuts/downloads level)', () => {
    // The folder structure requires `creator/{downloads|cuts}/<id>/file`;
    // anything else is noise from a misplaced drop.
    expect(isRelevantPath('C:/library/Creator/loose.mp4', ROOT, 'add')).toBe(false)
  })

  it('accepts ANY file under downloads/<videoId>/ (filter is structure-keyed, not extension-keyed)', () => {
    // Documented surprise: the implementation OR-combines the structure
    // regex with the extension regex, so any file inside the folder
    // structure passes regardless of extension. The downstream
    // ProcessFileNotifications use case is what actually filters by file
    // shape (.mp4, .meta.json, etc.). If this OR is ever tightened to AND,
    // these expectations should flip.
    expect(isRelevantPath('C:/library/Creator/downloads/abc/notes.txt', ROOT, 'add')).toBe(true)
    expect(isRelevantPath('C:/library/Creator/downloads/abc/file.mp4.part', ROOT, 'add')).toBe(true)
  })

  it('accepts both backslash and forward-slash separators', () => {
    expect(isRelevantPath('C:\\library\\Creator\\downloads\\abc\\file.mp4', ROOT, 'add')).toBe(true)
  })

  it('is case-insensitive on extensions (yt-dlp emits .MP4 occasionally)', () => {
    expect(isRelevantPath('C:/library/Creator/downloads/abc/file.MP4', ROOT, 'add')).toBe(true)
  })
})

describe('isRelevantPath — directory events', () => {
  it("accepts a top-level creator dir on 'addDir'", () => {
    expect(isRelevantPath('C:/library/Creator', ROOT, 'addDir')).toBe(true)
  })

  it("accepts a video dir under downloads/ on 'addDir'", () => {
    expect(isRelevantPath('C:/library/Creator/downloads/vid-1', ROOT, 'addDir')).toBe(true)
  })

  it("accepts a cut dir under cuts/ on 'addDir'", () => {
    expect(isRelevantPath('C:/library/Creator/cuts/cut-1', ROOT, 'addDir')).toBe(true)
  })

  it("accepts a creator dir on 'unlinkDir' (deletion)", () => {
    expect(isRelevantPath('C:/library/Creator', ROOT, 'unlinkDir')).toBe(true)
  })

  it('rejects the root itself (relative path is empty)', () => {
    expect(isRelevantPath('C:/library', ROOT, 'addDir')).toBe(false)
  })

  it('rejects a deeply nested unrelated dir', () => {
    expect(isRelevantPath('C:/library/Creator/__pycache__', ROOT, 'addDir')).toBe(false)
  })
})

describe('isCreatorDir', () => {
  it('accepts a single segment with surrounding slashes', () => {
    expect(isCreatorDir('/Creator')).toBe(true)
    expect(isCreatorDir('\\Creator')).toBe(true)
    expect(isCreatorDir('/Creator/')).toBe(true)
  })

  it('accepts a single segment with no slashes', () => {
    expect(isCreatorDir('Creator')).toBe(true)
  })

  it('rejects multi-segment paths', () => {
    expect(isCreatorDir('/Creator/downloads')).toBe(false)
    expect(isCreatorDir('\\Creator\\cuts')).toBe(false)
  })

  it('rejects an empty / whitespace-only relative', () => {
    expect(isCreatorDir('')).toBe(false)
    expect(isCreatorDir('/')).toBe(false)
    expect(isCreatorDir('//')).toBe(false)
  })
})
