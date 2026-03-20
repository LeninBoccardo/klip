import { describe, it, expect } from 'vitest'
import { classifyPath } from '@domain/types'

const ROOT = '/home/user/klip'

describe('classifyPath', () => {
  // ── Creator level ──

  it('classifies a creator directory', () => {
    expect(classifyPath(ROOT, `${ROOT}/MyCreator`)).toEqual({
      kind: 'creator',
      creatorName: 'MyCreator'
    })
  })

  it('classifies creator.json as creator', () => {
    expect(classifyPath(ROOT, `${ROOT}/MyCreator/creator.json`)).toEqual({
      kind: 'creator',
      creatorName: 'MyCreator'
    })
  })

  it('classifies downloads directory as creator-level', () => {
    expect(classifyPath(ROOT, `${ROOT}/MyCreator/downloads`)).toEqual({
      kind: 'creator',
      creatorName: 'MyCreator'
    })
  })

  it('classifies cuts directory as creator-level', () => {
    expect(classifyPath(ROOT, `${ROOT}/MyCreator/cuts`)).toEqual({
      kind: 'creator',
      creatorName: 'MyCreator'
    })
  })

  // ── Video level ──

  it('classifies a video directory', () => {
    expect(classifyPath(ROOT, `${ROOT}/Creator/downloads/vid123`)).toEqual({
      kind: 'video',
      creatorName: 'Creator',
      videoId: 'vid123'
    })
  })

  it('classifies a video file', () => {
    expect(classifyPath(ROOT, `${ROOT}/Creator/downloads/vid123/video.mp4`)).toEqual({
      kind: 'video',
      creatorName: 'Creator',
      videoId: 'vid123'
    })
  })

  it('classifies meta.json inside a video directory', () => {
    expect(classifyPath(ROOT, `${ROOT}/Creator/downloads/vid123/meta.json`)).toEqual({
      kind: 'video',
      creatorName: 'Creator',
      videoId: 'vid123'
    })
  })

  // ── Cut level ──

  it('classifies a cut directory', () => {
    expect(classifyPath(ROOT, `${ROOT}/Creator/cuts/cut456`)).toEqual({
      kind: 'cut',
      creatorName: 'Creator',
      cutId: 'cut456'
    })
  })

  it('classifies a cut file', () => {
    expect(classifyPath(ROOT, `${ROOT}/Creator/cuts/cut456/cut.mp4`)).toEqual({
      kind: 'cut',
      creatorName: 'Creator',
      cutId: 'cut456'
    })
  })

  it('classifies cut-data.json inside a cut directory', () => {
    expect(classifyPath(ROOT, `${ROOT}/Creator/cuts/cut456/cut-data.json`)).toEqual({
      kind: 'cut',
      creatorName: 'Creator',
      cutId: 'cut456'
    })
  })

  // ── Unknown / edge cases ──

  it('returns unknown for the root itself', () => {
    expect(classifyPath(ROOT, ROOT)).toEqual({ kind: 'unknown' })
  })

  it('returns unknown for unrecognised second segment', () => {
    expect(classifyPath(ROOT, `${ROOT}/Creator/randomfile.txt`)).toEqual({ kind: 'unknown' })
  })

  it('returns unknown for unrecognised category', () => {
    expect(classifyPath(ROOT, `${ROOT}/Creator/other/something`)).toEqual({ kind: 'unknown' })
  })

  // ── Windows-style separators ──

  it('handles Windows backslash separators', () => {
    expect(
      classifyPath('C:\\Users\\klip', 'C:\\Users\\klip\\Creator\\downloads\\vid1\\video.mp4')
    ).toEqual({
      kind: 'video',
      creatorName: 'Creator',
      videoId: 'vid1'
    })
  })

  // ── Additional edge cases ──

  it('handles path with trailing slash', () => {
    expect(classifyPath(ROOT, `${ROOT}/MyCreator/`)).toEqual({
      kind: 'creator',
      creatorName: 'MyCreator'
    })
  })

  it('handles path with double slashes', () => {
    expect(classifyPath(ROOT, `${ROOT}//MyCreator//downloads//vid1`)).toEqual({
      kind: 'video',
      creatorName: 'MyCreator',
      videoId: 'vid1'
    })
  })

  it('returns unknown for root with trailing slash', () => {
    expect(classifyPath(ROOT, `${ROOT}/`)).toEqual({ kind: 'unknown' })
  })

  it('handles deeply nested files inside video directory', () => {
    expect(classifyPath(ROOT, `${ROOT}/Creator/downloads/vid1/subfolder/deep.mp4`)).toEqual({
      kind: 'video',
      creatorName: 'Creator',
      videoId: 'vid1'
    })
  })

  it('handles deeply nested files inside cut directory', () => {
    expect(classifyPath(ROOT, `${ROOT}/Creator/cuts/cut1/subfolder/deep.mp4`)).toEqual({
      kind: 'cut',
      creatorName: 'Creator',
      cutId: 'cut1'
    })
  })
})
