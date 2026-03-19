/**
 * Downloads yt-dlp and ffprobe binaries for the current platform.
 *
 * Usage: npx tsx scripts/download-binaries.ts
 *    or: npm run setup
 *
 * Binaries are placed in resources/bin/ (gitignored).
 * Supports Windows, macOS, and Linux.
 */

import { createWriteStream, mkdirSync, chmodSync, existsSync, unlinkSync } from 'fs'
import { get } from 'https'
import { IncomingMessage } from 'http'
import { execSync } from 'child_process'
import { NodePathResolver } from '@main/interface-adapters/file-system'

const nodePathResolver = new NodePathResolver()

const BIN_DIR = nodePathResolver.join(__dirname, '..', 'resources', 'bin')

// ── Version pins ──
const YT_DLP_VERSION = '2025.02.19'
const FFPROBE_VERSION = '6.1'

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

const BASE_FFPROBE_URL = 'https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v'

function getFfprobeSpec(): BinarySpec {
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64'
  switch (platform) {
    case 'win32':
      return {
        name: 'ffprobe',
        url: `${BASE_FFPROBE_URL}${FFPROBE_VERSION}/ffprobe-${FFPROBE_VERSION}-win-64.zip`,
        outputName: 'ffprobe.exe',
        extractType: 'zip'
      }
    case 'darwin':
      return {
        name: 'ffprobe',
        url: `${BASE_FFPROBE_URL}${FFPROBE_VERSION}/ffprobe-${FFPROBE_VERSION}-macos-64.zip`,
        outputName: 'ffprobe',
        extractType: 'zip'
      }
    case 'linux':
      return {
        name: 'ffprobe',
        url: `${BASE_FFPROBE_URL}${FFPROBE_VERSION}/ffprobe-${FFPROBE_VERSION}-linux-${arch === 'arm64' ? 'arm-64' : '64'}.zip`,
        outputName: 'ffprobe',
        extractType: 'zip'
      }
    default:
      throw new Error(`Unsupported platform: ${platform}`)
  }
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
    // Use platform-native tools for zip extraction
    if (platform === 'win32') {
      execSync(
        `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${BIN_DIR}' -Force"`,
        { stdio: 'pipe' }
      )
    } else {
      execSync(`unzip -o "${zipPath}" -d "${BIN_DIR}"`, { stdio: 'pipe' })
    }
  } finally {
    // Clean up zip file
    if (existsSync(zipPath)) {
      unlinkSync(zipPath)
    }
  }
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

  // Make executable on Unix
  if (platform !== 'win32' && existsSync(dest)) {
    chmodSync(dest, 0o755)
  }

  if (existsSync(dest)) {
    console.log(`  ✓ ${spec.name} installed`)
  } else {
    throw new Error(`Failed to install ${spec.name} — file not found at ${dest}`)
  }
}

// ── Main ──

async function main(): Promise<void> {
  console.log(`\n[klip] Downloading external binaries for ${platform}...\n`)

  mkdirSync(BIN_DIR, { recursive: true })

  const specs = [getYtDlpSpec(), getFfprobeSpec()]

  for (const spec of specs) {
    await downloadBinary(spec)
  }

  console.log(`\n[klip] All binaries ready in resources/bin/\n`)
}

main().catch((err) => {
  console.error('\n[klip] Binary download failed:', err.message)
  process.exit(1)
})
