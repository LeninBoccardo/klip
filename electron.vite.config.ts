import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { PluginOption } from 'vite'
import { cpSync } from 'node:fs'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import pkg from './package.json'

function copyMigrations(): PluginOption {
  return {
    name: 'copy-drizzle-migrations',
    closeBundle() {
      const src = resolve('src/main/framework-drivers/database/migrations')
      const dest = resolve('out/main/migrations')
      cpSync(src, dest, { recursive: true })
    }
  }
}

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
    plugins: [copyMigrations()],
    build: {
      // p-queue, yocto-queue are ESM-only; drizzle-orm has a broken CJS
      // build (illegal newline after throw in migrator.cjs). Bundling them
      // lets Vite process the working ESM source instead.
      externalizeDeps: {
        exclude: ['p-queue', 'yocto-queue', 'drizzle-orm']
      }
    }
  },
  preload: {
    resolve: {
      alias: {
        '@preload': resolve('src/preload'),
        '@shared': resolve('src/shared')
      }
    },
    build: {
      // Sandboxed preload (`sandbox: true`) cannot resolve modules from
      // node_modules at runtime — Electron's sandbox preload runtime only
      // exposes a limited set of built-ins. Bundle @electron-toolkit/preload
      // inline so the require() doesn't fail at startup with
      //   "module not found: @electron-toolkit/preload"
      externalizeDeps: {
        exclude: ['@electron-toolkit/preload']
      }
    }
  },
  renderer: {
    // Single source of truth for the app version (F72): inject package.json's
    // version at build time so the sidebar/About no longer hardcode '0.0.1'.
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version)
    },
    resolve: {
      alias: {
        '@': resolve('src/renderer'),
        '@renderer': resolve('src/renderer/src'),
        '@components': resolve('src/renderer/components'),
        '@ui': resolve('src/renderer/components/ui'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true
      }),
      tailwindcss(),
      react()
    ]
  }
})
