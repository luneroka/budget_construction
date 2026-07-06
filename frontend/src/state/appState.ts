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
