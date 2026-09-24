import { useEffect, useRef } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useToasterStore } from 'react-hot-toast'
import { useLocation } from 'react-router-dom'

import { hasPendingWrites } from '@/api/client'
import { startAutoUpdate, type AutoUpdater } from '@/lib/autoUpdate'

// Every modal and dialog carries aria-modal (ModalShell and its siblings);
// the report drawer and the forms that sit in a page aren't modals, so they
// mark themselves while they hold something a reload would lose.
const WORK_IN_PROGRESS_SELECTOR =
  '[aria-modal="true"], [data-blocks-auto-update]'

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'radio',
  'range',
  'reset',
  'submit',
])

function hasTextInProgress(): boolean {
  const element = document.activeElement
  if (element instanceof HTMLTextAreaElement) return element.value !== ''
  if (element instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.has(element.type) && element.value !== ''
  }
  return element instanceof HTMLElement && element.isContentEditable
}

function isBusy(queryClient: QueryClient, hasVisibleToast: boolean): boolean {
  return (
    queryClient.isMutating() > 0 ||
    hasPendingWrites() ||
    // Creating a project, deleting a supplier or logging in toasts, then
    // changes page: reloading on that change would wipe the message as it
    // appears.
    hasVisibleToast ||
    document.querySelector(WORK_IN_PROGRESS_SELECTOR) !== null ||
    hasTextInProgress()
  )
}

/**
 * Reloads the tab onto a newly deployed build at the first moment it
 * costs nothing — see lib/autoUpdate.ts for when that is. Mounted at the
 * router root so the login page is covered too.
 */
export function AutoUpdate() {
  const queryClient = useQueryClient()
  const { toasts } = useToasterStore()
  const { pathname } = useLocation()
  const updaterRef = useRef<AutoUpdater | null>(null)
  const previousPathnameRef = useRef(pathname)
  const hasVisibleToastRef = useRef(false)

  useEffect(() => {
    const updater = startAutoUpdate(() =>
      isBusy(queryClient, hasVisibleToastRef.current),
    )
    updaterRef.current = updater
    return () => {
      updater.stop()
      updaterRef.current = null
    }
  }, [queryClient])

  // Before the pathname effect: a toast and the change of page it
  // announces land in the same commit.
  useEffect(() => {
    hasVisibleToastRef.current = toasts.some((toast) => toast.visible)
  }, [toasts])

  useEffect(() => {
    if (previousPathnameRef.current === pathname) return
    previousPathnameRef.current = pathname
    updaterRef.current?.onNavigation()
  }, [pathname])

  return null
}
