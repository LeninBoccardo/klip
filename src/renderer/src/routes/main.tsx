import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import '../assets/main.css'
import '../i18n'

import { routeTree } from '../routeTree.gen'

// FOUC prevention — paint with the user's previously-chosen theme before
// React mounts. `next-themes` does the same dance once it hydrates, but we
// can't wait for hydration without a single light-mode frame on dark setups.
// Runs synchronously inside the bundled module; no inline `<script>` tag
// needed (CSP forbids inline scripts).
;(() => {
  try {
    const stored = window.localStorage.getItem('klip-theme')
    const resolved =
      stored === 'light' || stored === 'dark'
        ? stored
        : window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
    document.documentElement.classList.add(resolved)
  } catch {
    // Inaccessible localStorage — next-themes will still apply on mount.
  }
})()

const router = createRouter({ routeTree })

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('root')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  )
}
