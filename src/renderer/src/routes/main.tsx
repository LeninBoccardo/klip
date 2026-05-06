import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import '../assets/main.css'
import '../i18n'

import { routeTree } from '../routeTree.gen'
import { EditorApp } from '../EditorApp'

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

// ── Hash-routed window dispatch ─────────────────────────────────────────
// The WindowManager opens the editor by appending `#/editor/<id>` to the
// renderer URL (plan §9.1). This entry parses the hash *before* React or
// the TanStack Router boot — the editor window mounts `EditorApp`
// directly (no sidebar, no command palette, no PersistentPlayer).
//
// `loadFile(html, { hash: '/editor/<id>' })` produces `#/editor/<id>` in
// production; dev `loadURL(URL + '#/editor/<id>')` produces the same.

const EDITOR_HASH_RE = /^#\/editor\/([^/?#]+)/

function parseEditorHash(hash: string): { sourceVideoId: string } | null {
  const match = EDITOR_HASH_RE.exec(hash)
  if (!match) return null
  try {
    return { sourceVideoId: decodeURIComponent(match[1]) }
  } catch {
    // Malformed percent-encoding — treat as not-an-editor-window so we
    // fall back to the main app instead of crashing on boot.
    return null
  }
}

const rootElement = document.getElementById('root')!
const editor = parseEditorHash(window.location.hash)

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  if (editor) {
    root.render(<EditorApp sourceVideoId={editor.sourceVideoId} />)
  } else {
    const router = createRouter({ routeTree })
    root.render(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>
    )
  }
}

// Register the router instance for type safety. Lives at module scope
// so it merges with TanStack Router's module regardless of which branch
// above ran (purely type-level — harmless in the editor window).
declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter<typeof routeTree>>
  }
}
