import { type ReactNode, useEffect, useMemo, useState } from 'react'

import { projectViewModels } from '@/demo/demo-data'
import { AppStateContext } from '@/state/appState'

const SELECTED_PROJECT_STORAGE_KEY = 'budget-construction:selected-project-id'

function getInitialProjectId() {
  if (typeof window === 'undefined') {
    return projectViewModels[0]?.id ?? ''
  }

  return (
    window.localStorage.getItem(SELECTED_PROJECT_STORAGE_KEY) ??
    projectViewModels[0]?.id ??
    ''
  )
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [selectedProjectId, setSelectedProjectId] = useState(getInitialProjectId)
  const value = useMemo(
    () => ({ selectedProjectId, setSelectedProjectId }),
    [selectedProjectId],
  )

  useEffect(() => {
    if (selectedProjectId) {
      window.localStorage.setItem(
        SELECTED_PROJECT_STORAGE_KEY,
        selectedProjectId,
      )
    }
  }, [selectedProjectId])

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  )
}
