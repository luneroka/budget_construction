export type ApiDate = string
export type ApiDateTime = string
export type ApiDecimal = string

export type ProjectStatus = 'draft' | 'active' | 'completed' | 'archived'
export type BudgetLineType = 'product' | 'breakdown'
export type ProductLineConversionStrategy =
  'archive_existing' | 'reuse_existing_as_breakdown'
export type TransactionType = 'quote' | 'diy_estimate' | 'invoice'
export type QuoteStatus = 'to_confirm' | 'to_negotiate' | 'validated'
export type InvoiceStatus = 'unpaid' | 'on_hold' | 'paid'
export type InvoiceType = 'full' | 'deposit' | 'interim' | 'balance'
export type PaymentMethod = 'cash' | 'card' | 'wire'
export type BudgetConcern = 'entire_product' | 'specific_element'

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

export type ProjectFromTemplateCreate = {
  name: string
  template_id: number
  description?: string | null
  location?: string | null
  start_date?: ApiDate | null
  end_date?: ApiDate | null
  project_status?: ProjectStatus
}

export type ProjectUpdate = {
  name?: string | null
  description?: string | null
  location?: string | null
  start_date?: ApiDate | null
  end_date?: ApiDate | null
  project_status?: ProjectStatus
}

export type ProductRead = {
  id: number
  subcategory_id: number
  name: string
  sort_order: number
  is_active: boolean
  created_at: ApiDateTime
  updated_at: ApiDateTime
}

export type ProductWithHierarchy = ProductRead & {
  subcategory_name: string
  category_id: number
  category_name: string
}

export type BudgetLineCreate = {
  product_id: number
  name: string
  item_type: BudgetLineType
  sort_order?: number
}

export type BudgetLineUpdate = {
  name?: string | null
  item_type?: BudgetLineType | null
  sort_order?: number | null
}

export type ProductLineConvertToBreakdown = {
  strategy?: ProductLineConversionStrategy | null
  existing_line_new_name?: string | null
  new_breakdown_names?: string[]
}

export type BudgetLineRead = {
  id: number
  project_id: number
  template_item_id: number | null
  product_id: number
  selected_quote_transaction_id: number | null
  selected_diy_estimate_transaction_id: number | null
  name: string
  item_type: BudgetLineType
  sort_order: number
  product: ProductWithHierarchy
  created_at: ApiDateTime
  updated_at: ApiDateTime
  deleted_at: ApiDateTime | null
}

export type GeneratedProjectRead = {
  project: ProjectRead
  budget_lines: BudgetLineRead[]
}

export type TemplateRead = {
  id: number
  name: string
  description: string | null
  is_active: boolean
  created_at: ApiDateTime
  updated_at: ApiDateTime
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

export type SupplierContactCreate = {
  name?: string | null
  phone_number?: string | null
  email?: string | null
  is_primary?: boolean
}

export type SupplierContactUpdate = SupplierContactCreate & {
  id?: number | null
}

export type SupplierCreate = {
  name: string
  siret?: string | null
  comment?: string | null
  contacts: SupplierContactCreate[]
}

export type SupplierUpdate = {
  name?: string | null
  siret?: string | null
  comment?: string | null
  contacts?: SupplierContactUpdate[] | null
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

export type TransactionBaseWrite = {
  supplier_id?: number | null
  transaction_type: TransactionType
  amount_ht: ApiDecimal
  vat_rate?: ApiDecimal | null
  amount_vat?: ApiDecimal | null
  amount_ttc?: ApiDecimal | null
  issued_date: ApiDate
  due_date?: ApiDate | null
  payment_date?: ApiDate | null
  description?: string | null
  quote_status?: QuoteStatus | null
  invoice_status?: InvoiceStatus | null
  invoice_type?: InvoiceType | null
  payment_method?: PaymentMethod | null
}

export type TransactionCreate = TransactionBaseWrite & {
  select_as_budget?: boolean
}

export type TransactionCreateForProduct = TransactionCreate & {
  budget_line_name?: string | null
  budget_concern?: BudgetConcern | null
}

export type TransactionUpdate = {
  supplier_id?: number | null
  amount_ht?: ApiDecimal | null
  vat_rate?: ApiDecimal | null
  amount_vat?: ApiDecimal | null
  amount_ttc?: ApiDecimal | null
  issued_date?: ApiDate | null
  due_date?: ApiDate | null
  payment_date?: ApiDate | null
  description?: string | null
  quote_status?: QuoteStatus | null
  invoice_status?: InvoiceStatus | null
  invoice_type?: InvoiceType | null
  payment_method?: PaymentMethod | null
}

export type TransactionRead = {
  id: number
  budget_line_id: number
  has_documents: boolean
  supplier_id: number | null
  transaction_type: TransactionType
  amount_ht: ApiDecimal
  vat_rate: ApiDecimal | null
  amount_vat: ApiDecimal | null
  amount_ttc: ApiDecimal
  issued_date: ApiDate
  due_date: ApiDate | null
  payment_date: ApiDate | null
  description: string | null
  quote_status: QuoteStatus | null
  invoice_status: InvoiceStatus | null
  invoice_type: InvoiceType | null
  payment_method: PaymentMethod | null
  created_at: ApiDateTime
  updated_at: ApiDateTime
  deleted_at: ApiDateTime | null
}

export type CatalogProductRead = {
  id: number
  name: string
  sort_order: number
  is_active: boolean
  created_at: ApiDateTime
  updated_at: ApiDateTime
}

export type CatalogSubcategoryRead = {
  id: number
  name: string
  sort_order: number
  is_active: boolean
  products: CatalogProductRead[]
}

export type CatalogCategoryRead = {
  id: number
  name: string
  sort_order: number
  is_active: boolean
  subcategories: CatalogSubcategoryRead[]
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

export type DocumentListRead = DocumentRead & {
  transaction_type: TransactionType
  transaction_description: string | null
}

export type DocumentDownloadUrl = {
  url: string
}
