/**
 * Wipe the dev log directory so the next `npm run dev` session starts
 * with a clean file. Useful when handing a fresh test session over to
 * tooling that reads `logs/klip-dev.log`.
 *
 * Usage:
 *   npm run logs:clear
 */

import { existsSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const logsDir = join(process.cwd(), 'logs')

if (existsSync(logsDir)) {
  rmSync(logsDir, { recursive: true, force: true })
  // eslint-disable-next-line no-console
  console.log(`Cleared ${logsDir}`)
} else {
  // eslint-disable-next-line no-console
  console.log(`No log directory at ${logsDir} (nothing to clear)`)
}

mkdirSync(logsDir, { recursive: true })
