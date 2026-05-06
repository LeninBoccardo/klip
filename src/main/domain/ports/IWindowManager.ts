/**
 * Owns the lifecycle of every BrowserWindow the app creates.
 *
 * Splitting window creation out of `src/main/index.ts` lets the Phase 5
 * editor window be opened on demand from an IPC handler (the user clicks
 * "Edit" in the main window) without `index.ts` needing to know about
 * the editor at all. The 1-of-N policy from plan §9.3 lives here too:
 * if an editor window is already open, `openEditorWindow` focuses it
 * and navigates to the new source video instead of creating a second.
 */
export interface IWindowManager {
  /** Create the primary window. Called once at boot from `app.whenReady`. */
  createMainWindow(): void

  /** Recreate the main window if it was closed (macOS dock-icon click handler). */
  recreateMainWindowIfClosed(): void

  /**
   * Open or focus the editor window for `sourceVideoId`. MVP enforces a
   * single editor window — a second call while one is open re-navigates
   * the existing window to the new source.
   */
  openEditorWindow(input: { sourceVideoId: string }): void
}
