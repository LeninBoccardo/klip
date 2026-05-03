import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useAppStore } from '@/hooks/use-app-store'
import { extractFirstUrl } from '@/lib/youtube-url'

const URI_TYPES = ['text/uri-list', 'text/plain']

function carriesUrl(dt: DataTransfer | null): boolean {
  if (!dt) return false
  for (const type of URI_TYPES) {
    if (dt.types.includes(type)) return true
  }
  return false
}

/**
 * Window-level drag-and-drop handler that intercepts URL drops anywhere in the
 * app, navigates to /downloads, and stashes the URL in the app store for the
 * page to pick up on mount.
 *
 * Uses a counter to handle nested-element dragenter/dragleave races: every
 * `dragenter` from a child element fires a `dragleave` on the parent, so we
 * only collapse the overlay when the counter returns to zero.
 */
export function useDropUrl(): boolean {
  const [active, setActive] = useState(false)
  const navigate = useNavigate()
  const setPendingDropUrl = useAppStore((s) => s.setPendingDropUrl)
  const { t } = useTranslation('downloads')
  const counter = useRef(0)

  useEffect(() => {
    const onDragEnter = (e: DragEvent): void => {
      if (!carriesUrl(e.dataTransfer)) return
      e.preventDefault()
      counter.current += 1
      setActive(true)
    }
    const onDragOver = (e: DragEvent): void => {
      if (!carriesUrl(e.dataTransfer)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onDragLeave = (e: DragEvent): void => {
      if (!carriesUrl(e.dataTransfer)) return
      counter.current -= 1
      if (counter.current <= 0) {
        counter.current = 0
        setActive(false)
      }
    }
    const onDrop = (e: DragEvent): void => {
      if (!carriesUrl(e.dataTransfer)) return
      e.preventDefault()
      counter.current = 0
      setActive(false)

      const text =
        e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain') || ''
      const url = extractFirstUrl(text)
      if (!url) {
        toast.error(t('dropZone.invalidUrl'))
        return
      }
      setPendingDropUrl(url)
      navigate({ to: '/downloads' })
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [navigate, setPendingDropUrl, t])

  return active
}
