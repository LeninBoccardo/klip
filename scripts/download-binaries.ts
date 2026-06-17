/**
 * Downloads yt-dlp, ffprobe, and ffmpeg binaries for the current platform.
 *
 * Usage: npx tsx scripts/download-binaries.ts
 *    or: npm run setup
 *
 * Binaries are placed in resources/bin/ (gitignored).
 * Supports Windows, macOS, and Linux.
 *
 * Licensing: ffmpeg + ffprobe are pulled from ffbinaries.com — the LGPL
 * 2.1+ builds. See NOTICE for the full disclosure trail. Do NOT swap to
 * GPL builds without auditing what infects.
 */

import { createWriteStream, mkdirSync, chmodSync, existsSync, unlinkSync, readFileSync } from 'fs'
import { createHash } from 'crypto'
import { get } from 'https'
import { IncomingMessage } from 'http'
import { execFileSync } from 'child_process'
import { NodePathResolver } from '@main/interface-adapters/file-system'

const nodePathResolver = new NodePathResolver()

const BIN_DIR = nodePathResolver.join(__dirname, '..', 'resources', 'bin')

// ── Version pins ──
const YT_DLP_VERSION = '2025.02.19'
// ffmpeg + ffprobe ship together from ffbinaries; pin a single version for
// both so a future bump touches one constant.
const FFMPEG_VERSION = '6.1'
const FFPROBE_VERSION = FFMPEG_VERSION

// ── SHA256 hashes — verify downloaded binaries against upstream releases ──
// Keyed by the DOWNLOAD ARTIFACT filename (the basename of spec.url), NOT the
// installed `outputName`: macOS and Linux both install to `ffmpeg`/`ffprobe`/
// `yt-dlp`, so an outputName-keyed map cannot hold their three distinct hashes.
// The artifact filename is unique per platform/arch, so it disambiguates.
//
// VALUES are the SHA256 of the INSTALLED binary — for yt-dlp the downloaded
// file itself; for ffmpeg/ffprobe the binary EXTRACTED from the zip (that is
// what `verifyBinaryHash` hashes). The ffbinaries `<name>-<version>-*.zip` keys
// are templated off the version constants so a bump retargets them automatically.
//
// Bumping versions: update the version constant, fetch the new artifacts, and
// repin. yt-dlp publishes an official `SHA2-256SUMS` per release (use those
// directly). ffbinaries does not, so download each zip, extract, and hash the
// inner binary (`unzip -o <zip> && shasum -a 256 <bin>` / `Get-FileHash`). A
// stale or missing hash fails closed (refuses to install) — set
// `KLIP_SKIP_BINARY_VERIFY=1` to bypass for one-off dev setup; never in CI/release.
const SHASUMS: Record<string, string> = {
  // yt-dlp 2025.02.19 — official SHA2-256SUMS for the raw release binaries.
  'yt-dlp.exe': 'b9fac42a19e118e1b0a5c98832928a1c25782d805a9905476bb55d479212621a',
  'yt-dlp_macos': 'fc92f4bc4b5bc4bb0406f47c52b1617e7d4b7e34ef4b6af992e80e338d5cda31',
  'yt-dlp_linux': 'a3e45133e1960a2ecc3c575b8470ab0d48a52bd92eb1ee3b4b82698fb9a2fc48',
  // ffmpeg/ffprobe 6.1 (ffbinaries) — SHA256 of the binary extracted from each zip.
  [`ffmpeg-${FFMPEG_VERSION}-win-64.zip`]:
    'ba242553f0ff60ad788069d5d376c1b4f7a2f3a3566416e0ed950ca7920da5fa',
  [`ffprobe-${FFPROBE_VERSION}-win-64.zip`]:
    'ae5db42a4b7d7fa719a325082e447adb5df674a69935117eb9dff2292a1f23ec',
  [`ffmpeg-${FFMPEG_VERSION}-macos-64.zip`]:
    'ca8945e5eef946a246d29c943b21f10db345a2ef050dd7ea1c77f877277dc2fa',
  [`ffprobe-${FFPROBE_VERSION}-macos-64.zip`]:
    '82f8b544e9924aed20f691f4b1b1ad0ba7e31d2a2e856ac29a1b6a31537e7f1f',
  [`ffmpeg-${FFMPEG_VERSION}-linux-64.zip`]:
    'a0082b064cc83f5606554fa2cc5b07194ade90f6669b1fcfd6499b29861ca403',
  [`ffprobe-${FFPROBE_VERSION}-linux-64.zip`]:
    'c2b0313686684e48f5dedbe29e510d56e70dead57a5e4219d32c6db32455c32a',
  [`ffmpeg-${FFMPEG_VERSION}-linux-arm-64.zip`]:
    '593df241f0e9f472e3e3fd2cbe12186b2509dceef82f02aa99e0053acec5dbd2',
  [`ffprobe-${FFPROBE_VERSION}-linux-arm-64.zip`]:
    '013c6ce924d689205e11d726a9e6d6924d5251bf2ea4d56256a9630d1a0522df'
}

// ── Platform detection ──
type Platform = 'win32' | 'darwin' | 'linux'
const platform = process.platform as Platform

interface BinarySpec {
  name: string
  url: string
  outputName: string
  extractType: 'raw' | 'zip'
}

function getYtDlpSpec(): BinarySpec {
  const base = `https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}`
  switch (platform) {
    case 'win32':
      return {
        name: 'yt-dlp',
        url: `${base}/yt-dlp.exe`,
        outputName: 'yt-dlp.exe',
        extractType: 'raw'
      }
    case 'darwin':
      return {
        name: 'yt-dlp',
        url: `${base}/yt-dlp_macos`,
        outputName: 'yt-dlp',
        extractType: 'raw'
      }
    case 'linux':
      return {
        name: 'yt-dlp',
        url: `${base}/yt-dlp_linux`,
        outputName: 'yt-dlp',
        extractType: 'raw'
      }
    default:
      throw new Error(`Unsupported platform: ${platform}`)
  }
}

const BASE_FFBINARIES_URL = 'https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v'

/**
 * ffmpeg and ffprobe share the same archive layout on ffbinaries — only
 * the binary name and per-platform `<name>-<version>-<platform>.zip` URL
 * differ. Factored so adding a third co-published tool (ffplay) later
 * is one line.
 */
function getFfbinariesSpec(name: 'ffmpeg' | 'ffprobe', version: string): BinarySpec {
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64'
  switch (platform) {
    case 'win32':
      return {
        name,
        url: `${BASE_FFBINARIES_URL}${version}/${name}-${version}-win-64.zip`,
        outputName: `${name}.exe`,
        extractType: 'zip'
      }
    case 'darwin':
      return {
        name,
        url: `${BASE_FFBINARIES_URL}${version}/${name}-${version}-macos-64.zip`,
        outputName: name,
        extractType: 'zip'
      }
    case 'linux':
      return {
        name,
        url: `${BASE_FFBINARIES_URL}${version}/${name}-${version}-linux-${arch === 'arm64' ? 'arm-64' : '64'}.zip`,
        outputName: name,
        extractType: 'zip'
      }
    default:
      throw new Error(`Unsupported platform: ${platform}`)
  }
}

function getFfprobeSpec(): BinarySpec {
  return getFfbinariesSpec('ffprobe', FFPROBE_VERSION)
}

function getFfmpegSpec(): BinarySpec {
  return getFfbinariesSpec('ffmpeg', FFMPEG_VERSION)
}

// ── Download helpers ──

function followRedirects(url: string): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        followRedirects(res.headers.location).then(resolve, reject)
      } else if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        resolve(res)
      } else {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      }
    }).on('error', reject)
  })
}

async function downloadRaw(url: string, dest: string): Promise<void> {
  console.log(`  Downloading ${url}`)
  const res = await followRedirects(url)
  const contentLength = parseInt(res.headers['content-length'] ?? '0', 10)

  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest)
    let downloaded = 0

    res.on('data', (chunk: Buffer) => {
      downloaded += chunk.length
      if (contentLength > 0) {
        const pct = ((downloaded / contentLength) * 100).toFixed(1)
        process.stdout.write(`\r  Progress: ${pct}%`)
      }
    })

    res.pipe(file)
    file.on('finish', () => {
      process.stdout.write('\n')
      file.close()
      resolve()
    })
    file.on('error', reject)
    res.on('error', reject)
  })
}

async function downloadAndExtractZip(url: string, outputName: string): Promise<void> {
  const zipPath = nodePathResolver.join(BIN_DIR, `${outputName}.zip`)
  await downloadRaw(url, zipPath)

  console.log(`  Extracting ${outputName}...`)
  try {
    // Use array-form `execFileSync` so paths can never reach a shell parser.
    // Earlier the script used `execSync` with template-interpolated paths — a
    // username with `'` or `"` (rare on Windows but possible on macOS/Linux)
    // could break out of the quoting and inject. The unzip form is fully
    // shell-free; the powershell form keeps the script literal in `-Command`
    // but the path arguments are now bound through powershell's own parser.
    if (platform === 'win32') {
      execFileSync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `Expand-Archive -Path "${zipPath}" -DestinationPath "${BIN_DIR}" -Force`
        ],
        { stdio: 'pipe' }
      )
    } else {
      execFileSync('unzip', ['-o', zipPath, '-d', BIN_DIR], { stdio: 'pipe' })
    }
  } finally {
    // Clean up zip file
    if (existsSync(zipPath)) {
      unlinkSync(zipPath)
    }
  }
}

function verifyBinaryHash(filePath: string, spec: BinarySpec): void {
  // Hashes are keyed by the download-artifact filename (basename of the URL),
  // which is unique per platform/arch — unlike outputName, which collides across
  // platforms (mac/linux both install plain `ffmpeg`/`ffprobe`/`yt-dlp`).
  const artifact = spec.url.split('/').pop() ?? spec.url
  const expected = SHASUMS[artifact]
  if (!expected) {
    if (process.env.KLIP_SKIP_BINARY_VERIFY === '1') {
      console.warn(`  ⚠ No SHA256 pinned for ${artifact} — bypassed via KLIP_SKIP_BINARY_VERIFY.`)
      return
    }
    unlinkSync(filePath)
    throw new Error(
      `No SHA256 pinned for ${artifact}. Refusing to install an unverified binary. ` +
        `Pin its hash in scripts/download-binaries.ts (SHASUMS), or set ` +
        `KLIP_SKIP_BINARY_VERIFY=1 to bypass (dev only).`
    )
  }
  const actual = createHash('sha256').update(readFileSync(filePath)).digest('hex')
  if (actual === expected) {
    console.log(`  ✓ SHA256 verified for ${spec.outputName} (${artifact})`)
    return
  }
  if (process.env.KLIP_SKIP_BINARY_VERIFY === '1') {
    console.warn(
      `  ⚠ SHA256 mismatch for ${artifact} (expected ${expected}, got ${actual}) — bypassed via KLIP_SKIP_BINARY_VERIFY.`
    )
    return
  }
  unlinkSync(filePath)
  throw new Error(
    `SHA256 mismatch for ${artifact}: expected ${expected}, got ${actual}. ` +
      `Refusing to install a tampered or stale binary. ` +
      `Set KLIP_SKIP_BINARY_VERIFY=1 to bypass (dev only).`
  )
}

async function downloadBinary(spec: BinarySpec): Promise<void> {
  const dest = nodePathResolver.join(BIN_DIR, spec.outputName)

  if (existsSync(dest)) {
    console.log(`  ✓ ${spec.name} already exists, skipping`)
    return
  }

  console.log(`  ⬇ Downloading ${spec.name}...`)

  if (spec.extractType === 'zip') {
    await downloadAndExtractZip(spec.url, spec.outputName)
  } else {
    await downloadRaw(spec.url, dest)
  }

  if (!existsSync(dest)) {
    throw new Error(`Failed to install ${spec.name} — file not found at ${dest}`)
  }

  // Verify the binary integrity BEFORE making it executable. A tampered binary
  // should never be marked +x — that's the whole point of the check.
  verifyBinaryHash(dest, spec)

  // Make executable on Unix
  if (platform !== 'win32') {
    chmodSync(dest, 0o755)
  }

  console.log(`  ✓ ${spec.name} installed`)
}

// ── Main ──

async function main(): Promise<void> {
  console.log(`\n[klip] Downloading external binaries for ${platform}...\n`)

  mkdirSync(BIN_DIR, { recursive: true })

  const specs = [getYtDlpSpec(), getFfprobeSpec(), getFfmpegSpec()]

  for (const spec of specs) {
    await downloadBinary(spec)
  }

  console.log(`\n[klip] All binaries ready in resources/bin/\n`)
}

main().catch((err) => {
  console.error('\n[klip] Binary download failed:', err.message)
  process.exit(1)
})
