/**
 * Seeds a local klip database with synthetic creators / videos / cuts so
 * performance work (Item 18) can be measured against realistic row counts.
 *
 * Run:
 *   npx tsx scripts/seed-bench.ts
 *   # or with a custom DB path / scale:
 *   KLIP_DB=./bench.db CREATORS=5000 VIDEOS_PER_CREATOR=1 CUTS=1000 npx tsx scripts/seed-bench.ts
 *
 * Defaults: 5000 creators × 1 video each + 1000 cuts. Single transaction;
 * the whole thing finishes in well under a second on a modern laptop.
 *
 * The script writes directly to the SQLite handle — no IPC, no Electron
 * launch — so it's safe to run while the app is closed. Open the app
 * afterwards and inspect the dashboard / activity / search pages.
 */

import BetterSqlite3 from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

const DB_PATH =
  process.env.KLIP_DB ?? join(homedir(), 'AppData', 'Roaming', 'klip', 'klip.db')
const CREATORS = Number(process.env.CREATORS ?? 5000)
const VIDEOS_PER_CREATOR = Number(process.env.VIDEOS_PER_CREATOR ?? 1)
const CUTS = Number(process.env.CUTS ?? 1000)

mkdirSync(dirname(DB_PATH), { recursive: true })

const raw = new BetterSqlite3(DB_PATH)
raw.pragma('journal_mode = WAL')
raw.pragma('foreign_keys = ON')

console.log(
  `[seed-bench] Target DB: ${DB_PATH}\n` +
    `[seed-bench] Plan: ${CREATORS} creators × ${VIDEOS_PER_CREATOR} videos + ${CUTS} cuts`
)

const insertCreator = raw.prepare(
  `INSERT OR IGNORE INTO creators (id, folder_name, name, tags, status, created_at, updated_at)
   VALUES (?, ?, ?, '[]', 'active', datetime('now'), datetime('now'))`
)
const insertVideo = raw.prepare(
  `INSERT OR IGNORE INTO videos (id, creator_id, title, url, file_path, tags, status,
                                 duration, file_size, download_date, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, '[]', 'active', ?, ?, ?, ?, ?)`
)
const insertCut = raw.prepare(
  `INSERT OR IGNORE INTO cuts (id, creator_id, video_id, title, tags, file_path,
                               status, duration, file_size, created_at, updated_at)
   VALUES (?, ?, ?, ?, '[]', ?, 'active', ?, ?, datetime('now'), datetime('now'))`
)

const tx = raw.transaction(() => {
  const start = Date.now()

  for (let c = 0; c < CREATORS; c += 1) {
    const folder = `bench-creator-${c.toString().padStart(5, '0')}`
    insertCreator.run(folder, folder, `Bench Creator ${c}`)

    for (let v = 0; v < VIDEOS_PER_CREATOR; v += 1) {
      const id = `bv-${c.toString(36)}-${v.toString(36)}`
      // Spread download_date over the last 30 days so the dashboard chart
      // gets meaningful data.
      const dayOffset = (c + v) % 30
      const ts = `datetime('now', '-${dayOffset} days')`
      insertVideo.run(
        id,
        folder,
        `Bench video ${c}/${v} — sample title`,
        `https://youtube.com/watch?v=${id}`,
        `/bench/${folder}/downloads/${id}/video.mp4`,
        300 + ((c * 7 + v) % 1800), // duration: 5–35min
        50_000_000 + ((c * 13 + v) % 200_000_000), // 50MB–250MB
        // download_date / created_at / updated_at — sqlite parses raw SQL
        // expressions only via .exec, so use a JS-side ISO instead.
        new Date(Date.now() - dayOffset * 86_400_000).toISOString(),
        new Date(Date.now() - dayOffset * 86_400_000).toISOString(),
        new Date(Date.now() - dayOffset * 86_400_000).toISOString()
      )
    }
  }

  for (let i = 0; i < CUTS; i += 1) {
    const cId = `bench-creator-${(i % CREATORS).toString().padStart(5, '0')}`
    const id = `bcut-${i.toString(36)}`
    insertCut.run(
      id,
      cId,
      null,
      `Bench cut ${i}`,
      `/bench/${cId}/cuts/${id}/cut.mp4`,
      30 + (i % 300),
      5_000_000 + ((i * 17) % 50_000_000)
    )
  }

  const elapsed = Date.now() - start
  console.log(`[seed-bench] Inserts complete in ${elapsed} ms`)
})

tx()

const counts = raw
  .prepare(
    `SELECT
       (SELECT count(*) FROM creators) AS creators,
       (SELECT count(*) FROM videos)   AS videos,
       (SELECT count(*) FROM cuts)     AS cuts`
  )
  .get() as { creators: number; videos: number; cuts: number }

console.log(`[seed-bench] DB now contains:`, counts)

raw.close()
