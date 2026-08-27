import { createContext, useContext } from 'react'

export type AppStateContextValue = {
  selectedProjectId: string
  setSelectedProjectId: (projectId: string) => void
}

export const AppStateContext = createContext<AppStateContextValue | null>(null)

export function useAppState() {
  const value = useContext(AppStateContext)

  if (value === null) {
    throw new Error('useAppState must be used inside AppStateProvider')
  }

  return value
}

// The selected project as a number, or null when nothing valid is selected.
// `Number('')` is 0 and passes `Number.isInteger`, so the `> 0` guard is what
// keeps pages from requesting `/projects/0/...` before a project is chosen.
export function useSelectedProjectId(): number | null {
  const { selectedProjectId } = useAppState()
  const projectId = Number(selectedProjectId)
  return Number.isInteger(projectId) && projectId > 0 ? projectId : null
}
