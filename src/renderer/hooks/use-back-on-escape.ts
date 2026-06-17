import { useRouter } from '@tanstack/react-router'
import { useShortcut } from './use-shortcut'

/**
 * Detail-page "Escape goes back" affordance, shared by the video/creator/
 * collection detail routes.
 *
 * Escape only — the Backspace binding was dropped (F31): it revived the
 * deprecated browser footgun where a stray Backspace on any non-input focus
 * target (a button, a focused card) silently navigated the user back.
 *
 * The handler no-ops while a Radix dialog is open (F30): Radix dismisses Escape
 * via a capture-phase listener but does NOT stopPropagation, so the same Escape
 * event still bubbles to useShortcut's window listener — without this guard a
 * single Escape would both close the dialog AND navigate the page away.
 * `useShortcut` already suppresses the shortcut while a text input is focused.
 */
export function useBackOnEscape(): void {
  const router = useRouter()
  useShortcut('escape', () => {
    if (document.querySelector('[role="dialog"][data-state="open"]')) return
    router.history.back()
  })
}
