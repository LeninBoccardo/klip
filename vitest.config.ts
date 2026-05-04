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
            '@preload': resolve(__dirname, 'src/preload'),
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
        'src/main/use-cases/I*.ts',
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
        'src/renderer/src/env.d.ts',
        'src/renderer/src/routeTree.gen.ts',
        // TanStack Router file-based routes are framework-bound thin wrappers
        // (mount containers + pass router context). Same precedent as
        // `interface-adapters/controllers/**` on the main process.
        'src/renderer/src/routes/**'
      ],
      thresholds: {
        // Realistic floor for the current renderer surface — raise as feature
        // containers and remaining hooks grow tests. Functions trails the
        // other metrics because several read-query hooks and event-listener
        // hooks have no direct tests yet (call sites cover them indirectly).
        statements: 70,
        branches: 70,
        functions: 65,
        lines: 75,
        // Per-glob gate: use-cases must clear AGENTS.md L508's 90% target.
        'src/main/use-cases/**/*.ts': {
          lines: 90,
          branches: 80
        }
      }
    }
  }
})
