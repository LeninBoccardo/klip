import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@domain': resolve('src/main/domain'),
        '@use-cases': resolve('src/main/use-cases'),
        '@shared': resolve('src/shared')
      }
    },
    build: {
      // p-queue and yocto-queue are ESM-only packages.
      // They must be bundled (not externalized) so Vite handles
      // the ESM default-export interop in the CJS main process.
      externalizeDeps: {
        exclude: ['p-queue', 'yocto-queue']
      }
    }
  },
  preload: {
    resolve: {
      alias: {
        '@preload': resolve('src/preload'),
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer'),
        '@renderer': resolve('src/renderer/src'),
        '@components': resolve('src/renderer/components'),
        '@ui': resolve('src/renderer/components/ui'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
