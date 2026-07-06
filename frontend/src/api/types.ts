export type ApiDate = string
export type ApiDateTime = string
export type ApiDecimal = string

export type ProjectStatus = 'draft' | 'active' | 'completed' | 'archived'
export type BudgetLineType = 'product' | 'breakdown'

export type TokenRead = {
  access_token: string
}

export type UserRead = {
  id: number
  name: string
  email: string
  created_at: ApiDateTime
  updated_at: ApiDateTime | null
  deleted_at: ApiDateTime | null
}

export type ProjectRead = {
  id: number
  user_id: number
  template_id: number | null
  name: string
  description: string | null
  location: string | null
  start_date: ApiDate | null
  end_date: ApiDate | null
  project_status: ProjectStatus
  created_at: ApiDateTime | null
  updated_at: ApiDateTime | null
  deleted_at: ApiDateTime | null
}

export type SupplierContactRead = {
  id: number
  supplier_id: number
  name: string | null
  phone_number: string | null
  email: string | null
  is_primary: boolean
  created_at: ApiDateTime
  updated_at: ApiDateTime
}

export type SupplierRead = {
  id: number
  user_id: number
  name: string
  siret: string | null
  comment: string | null
  contacts: SupplierContactRead[]
  created_at: ApiDateTime
  updated_at: ApiDateTime
  deleted_at: ApiDateTime | null
}

export type FinancialTotalsRead = {
  selected_budget_amount_ttc: ApiDecimal
  selected_quote_budget_amount_ttc: ApiDecimal
  selected_diy_budget_amount_ttc: ApiDecimal
  quote_amount_ttc: ApiDecimal
  validated_quote_amount_ttc: ApiDecimal
  diy_estimate_amount_ttc: ApiDecimal
  actual_cost_amount_ttc: ApiDecimal
  paid_invoice_amount_ttc: ApiDecimal
  unpaid_invoice_amount_ttc: ApiDecimal
  on_hold_invoice_amount_ttc: ApiDecimal
  selected_budget_variance_ttc: ApiDecimal
  selected_quote_budget_variance_ttc: ApiDecimal
  quote_count: number
  validated_quote_count: number
  diy_estimate_count: number
  invoice_count: number
}

export type BudgetLineFinancialSummaryRead = FinancialTotalsRead & {
  budget_line_id: number
  name: string
  item_type: BudgetLineType
  selected_quote_transaction_id: number | null
  selected_diy_estimate_transaction_id: number | null
}

export type ProductFinancialSummaryRead = FinancialTotalsRead & {
  product_id: number
  product_name: string
  subcategory_name: string
  category_name: string
  budget_lines: BudgetLineFinancialSummaryRead[]
}

export type ProjectFinancialSummaryRead = FinancialTotalsRead & {
  project_id: number
  generated_at: ApiDateTime
  products: ProductFinancialSummaryRead[]
}

export type DocumentRead = {
  id: number
  transaction_id: number
  user_id: number
  original_filename: string
  stored_filename: string
  file_path: string
  mime_type: string
  file_size: number
  created_at: ApiDateTime
  updated_at: ApiDateTime
  deleted_at: ApiDateTime | null
}

export type DocumentDownloadUrl = {
  url: string
}
