export type ProjectStatus = 'draft' | 'active' | 'completed' | 'archived'

export type MockProject = {
  id: string
  name: string
  selected_budget_amount_ttc: number
  project_status: ProjectStatus
  location: string
}

export const mockProjects: MockProject[] = [
  {
    id: 'maison-individuelle-lyon',
    name: 'Maison individuelle',
    selected_budget_amount_ttc: 245000,
    project_status: 'active',
    location: 'Lyon',
  },
  {
    id: 'renovation-ferme-ain',
    name: 'Renovation ferme',
    selected_budget_amount_ttc: 186500,
    project_status: 'draft',
    location: 'Ain',
  },
  {
    id: 'extension-garage',
    name: 'Extension garage',
    selected_budget_amount_ttc: 68400,
    project_status: 'completed',
    location: 'Villeurbanne',
  },
]
