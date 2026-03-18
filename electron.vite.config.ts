import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer'),
        '@renderer': resolve('src/renderer/src'),
        '@components': resolve('src/renderer/components'),
        '@ui': resolve('src/renderer/components/ui'),
        '@main': resolve('src/main'),
        '@domain': resolve('src/main/domain'),
        '@use-cases': resolve('src/main/use-cases'),
        '@preload': resolve('src/preload')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
