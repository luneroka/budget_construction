export type ProjectStatus = 'draft' | 'active' | 'completed' | 'archived'

export type Project = {
  id: string
  user_id: string
  name: string
  description: string
  location: string
  start_date: string
  end_date: string
  project_status: ProjectStatus
  // « Devis retenus » of the whole project.
  validated_quote_amount_ttc: number
}
