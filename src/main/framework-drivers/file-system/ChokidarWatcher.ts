import { watch } from 'chokidar'
import type { FSWatcher } from 'chokidar'
import { existsSync, mkdirSync } from 'fs'
import type { IFileWatcher } from '@domain/ports'
import type { FileEvent, FileEventType } from '@domain/types'
import { redactPath, redactError } from '@domain/types/redact'
import { isRelevantPath } from './chokidar-path-filter'

/** Retry interval when root directory doesn't exist yet (ms) */
const ROOT_RETRY_INTERVAL = 3000

/** Maximum retries before giving up */
const ROOT_MAX_RETRIES = 20

/**
 * File-system watcher backed by chokidar.
 *
 * - Translates chokidar's five events into `FileEvent` objects
 * - Pre-filters irrelevant paths to keep the notification queue lean
 * - Uses `awaitWriteFinish` to handle large .mp4 files being written
 * - Auto-creates root directory if missing, retries until it appears
 */
export class ChokidarWatcher implements IFileWatcher {
  private watcher: FSWatcher | null = null
  private callback: ((event: FileEvent) => void) | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private stopped = false
  private rootPath: string

  constructor(rootPath: string) {
    this.rootPath = rootPath
  }

  onEvent(callback: (event: FileEvent) => void): void {
    this.callback = callback
  }

  start(): void {
    this.stopped = false
    this.ensureRootAndWatch()
  }

  async stop(): Promise<void> {
    this.stopped = true

    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }

    // Await close so callers can be sure no more events will fire after stop()
    // resolves. Without this, restart() can spin up a new watcher while the old
    // one is still emitting events from a stale root.
    if (this.watcher) {
      const old = this.watcher
      this.watcher = null
      await old.close()
    }
  }

  async restart(newRootPath: string): Promise<void> {
    await this.stop()
    this.rootPath = newRootPath
    this.start()
  }

  // ── Private ──

  private ensureRootAndWatch(attempt = 0): void {
    if (this.stopped) return

    // Try to create the root directory if it doesn't exist
    if (!existsSync(this.rootPath)) {
      try {
        mkdirSync(this.rootPath, { recursive: true })
        console.log(`[klip] Created root directory: ${redactPath(this.rootPath, this.rootPath)}`)
      } catch {
        if (attempt < ROOT_MAX_RETRIES) {
          console.warn(
            `[klip] Root directory not accessible, retrying in ${ROOT_RETRY_INTERVAL}ms (${attempt + 1}/${ROOT_MAX_RETRIES})`
          )
          this.retryTimer = setTimeout(
            () => this.ensureRootAndWatch(attempt + 1),
            ROOT_RETRY_INTERVAL
          )
          return
        }
        console.error(`[klip] Failed to create root directory after ${ROOT_MAX_RETRIES} retries`)
        return
      }
    }

    this.createWatcher()
  }

  private createWatcher(): void {
    if (this.stopped) return

    this.watcher = watch(this.rootPath, {
      persistent: true,
      ignoreInitial: true, // Startup scan handled by explicit reconcile.execute()
      depth: 4, // root / creator / downloads|cuts / id / file
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100
      },
      ignored: [
        /(^|[/\\])\../, // dotfiles
        /node_modules/,
        /\.DS_Store/,
        // yt-dlp transient files. Watching them is pointless (they're
        // intermediates, deleted post-merge) and on Windows it triggers
        // EPERM noise because yt-dlp holds them open exclusively for
        // writing while chokidar tries to attach a per-file watcher.
        /\.part$/i, // partial download
        /\.part-Frag\d+$/i, // HLS fragment in-flight
        /\.f\d+\.(mp4|m4a|webm|opus|aac)$/i, // intermediate format file
        /\.ytdl$/i // yt-dlp lockfile
      ]
    })

    const events: FileEventType[] = ['add', 'addDir', 'change', 'unlink', 'unlinkDir']

    for (const eventType of events) {
      this.watcher.on(eventType, (filePath: string) => {
        if (this.callback && isRelevantPath(filePath, this.rootPath, eventType)) {
          this.callback({ type: eventType, path: filePath })
        }
      })
    }

    this.watcher.on('error', (error) => {
      console.error('[klip] Watcher error:', redactError(error, this.rootPath))
    })

    console.log(`[klip] File watcher started on: ${redactPath(this.rootPath, this.rootPath)}`)
  }
}
