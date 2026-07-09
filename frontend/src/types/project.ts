export type ProjectStatus = 'draft' | 'active' | 'completed' | 'archived'

export type Project = {
  id: string
  user_id: string
  template_id: number
  name: string
  description: string
  location: string
  start_date: string
  end_date: string
  project_status: ProjectStatus
  selected_budget_amount_ttc: number
}

export type ProjectTemplate = {
  id: number
  name: string
  project_id: string
}
