import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'main',
          environment: 'node',
          include: ['tests/main/**/*.test.ts'],
          setupFiles: ['tests/setup/main.setup.ts']
        },
        resolve: {
          alias: {
            '@main': resolve(__dirname, 'src/main'),
            '@domain': resolve(__dirname, 'src/main/domain'),
            '@use-cases': resolve(__dirname, 'src/main/use-cases'),
            '@shared': resolve(__dirname, 'src/shared')
          }
        }
      },
      {
        plugins: [react()],
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['tests/renderer/**/*.test.{ts,tsx}'],
          setupFiles: ['tests/setup/renderer.setup.ts']
        },
        resolve: {
          alias: {
            '@': resolve(__dirname, 'src/renderer'),
            '@renderer': resolve(__dirname, 'src/renderer/src'),
            '@components': resolve(__dirname, 'src/renderer/components'),
            '@ui': resolve(__dirname, 'src/renderer/components/ui'),
            '@shared': resolve(__dirname, 'src/shared')
          }
        }
      }
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/main/**/*.ts', 'src/renderer/**/*.{ts,tsx}', 'src/shared/**/*.ts'],
      exclude: [
        'src/main/index.ts',
        'src/main/composition-root.ts',
        'src/main/**/index.ts',
        'src/main/domain/entities/**',
        'src/main/domain/repositories/I*.ts',
        'src/main/domain/ports/I*.ts',
        'src/main/domain/types/entity-status.ts',
        'src/main/domain/types/file-event.ts',
        'src/main/domain/types/notification-events.ts',
        'src/main/domain/types/download.ts',
        'src/main/domain/types/media-probe.ts',
        'src/main/use-cases/IReconcileDirectory.ts',
        'src/main/use-cases/IFetchVideoInfo.ts',
        'src/main/use-cases/IDownloadVideo.ts',
        'src/main/use-cases/IProbeMediaFile.ts',
        'src/main/use-cases/IRecoverOperations.ts',
        'src/main/interface-adapters/controllers/**',
        'src/main/interface-adapters/file-system/**',
        'src/main/framework-drivers/electron/**',
        'src/main/framework-drivers/file-system/**',
        'src/main/framework-drivers/yt-dlp/**',
        'src/main/framework-drivers/ffprobe/**',
        'src/main/framework-drivers/database/schema.ts',
        'src/main/framework-drivers/database/migrations/**',
        'src/shared/**',
        'src/renderer/components/ui/**',
        'src/renderer/src/env.d.ts'
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80
      }
    }
  }
})
