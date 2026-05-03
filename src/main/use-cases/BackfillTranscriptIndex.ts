import type { IFileSystemReader, IVideoTranscriptIndex } from '@domain/ports'
import { parseVtt } from '@domain/types'
import { redactError } from '@domain/types/redact'
import type {
  IBackfillTranscriptIndex,
  BackfillTranscriptIndexResult
} from './IBackfillTranscriptIndex'

export class BackfillTranscriptIndex implements IBackfillTranscriptIndex {
  constructor(
    private readonly index: IVideoTranscriptIndex,
    private readonly fsReader: IFileSystemReader
  ) {}

  async execute(): Promise<BackfillTranscriptIndexResult> {
    const result: BackfillTranscriptIndexResult = {
      alreadyIndexed: 0,
      indexed: 0,
      missing: 0,
      failed: 0
    }

    const candidates = this.index.findVideosNeedingBackfill()
    for (const { id, transcriptPath } of candidates) {
      let raw: string | null = null
      try {
        raw = this.fsReader.readTextFile(transcriptPath)
      } catch (err) {
        // readTextFile is expected to return null on missing files; a thrown
        // error means a permission or device-level problem worth logging.
        console.warn(`[klip] backfill: read failed for ${id}:`, redactError(err))
      }

      if (!raw) {
        result.missing++
        continue
      }

      try {
        const text = parseVtt(raw)
        this.index.setTranscriptText(id, text)
        result.indexed++
      } catch (err) {
        console.warn(`[klip] backfill: parse failed for ${id}:`, redactError(err))
        result.failed++
      }
    }

    return result
  }
}
