import { type ReactNode, useEffect, useMemo, useState } from 'react'

import { AppStateContext } from '@/state/appState'

const SELECTED_PROJECT_STORAGE_KEY = 'budget-construction:selected-project-id'

// localStorage can throw (Safari private mode, embedded browsers with site
// data blocked); losing the remembered project is fine, crashing is not.
function getInitialProjectId() {
  try {
    return window.localStorage.getItem(SELECTED_PROJECT_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function persistProjectId(projectId: string) {
  try {
    if (projectId) {
      window.localStorage.setItem(SELECTED_PROJECT_STORAGE_KEY, projectId)
    } else {
      window.localStorage.removeItem(SELECTED_PROJECT_STORAGE_KEY)
    }
  } catch {
    // Ignore: the selection still lives in React state for this session.
  }
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [selectedProjectId, setSelectedProjectId] =
    useState(getInitialProjectId)
  const value = useMemo(
    () => ({ selectedProjectId, setSelectedProjectId }),
    [selectedProjectId],
  )

  useEffect(() => {
    persistProjectId(selectedProjectId)
  }, [selectedProjectId])

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  )
}
