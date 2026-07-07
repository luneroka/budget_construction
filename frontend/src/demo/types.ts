export type ProjectStatus = 'draft' | 'active' | 'completed' | 'archived'
export type BudgetLineType = 'product' | 'breakdown'
export type TransactionType = 'quote' | 'diy_estimate' | 'invoice'
export type QuoteStatus = 'to_confirm' | 'to_negotiate' | 'validated'
export type InvoiceStatus = 'unpaid' | 'on_hold' | 'paid'
export type InvoiceType = 'full' | 'deposit' | 'interim' | 'balance'
export type PaymentMethod = 'cash' | 'card' | 'wire'
export type DocumentDisplayState =
  'attached' | 'missing' | 'deleted' | 'upload_error'

export type CatalogSeed = Array<{
  name: string
  sort_order: number
  subcategories: Array<{
    name: string
    sort_order: number
    products: Array<{
      name: string
      sort_order: number
    }>
  }>
}>

export type PowerBiSeed = {
  schema_version: number
  demo_key: string
  user: {
    key: string
    name: string
    email: string
    password: string
  }
  project: {
    key: string
    source_template: {
      id: number
      name: string
    }
    name: string
    description: string
    location: string
    start_date: string
    end_date: string
    project_status: ProjectStatus
  }
  suppliers: Array<{
    key: string
    name: string
    email: string
    contact_name: string
    phone_number: string
    comment: string
  }>
  transaction_defaults: {
    currency: string
    vat_rate: string
    quote_status: QuoteStatus
    invoice_status: InvoiceStatus
    payment_method: PaymentMethod
  }
  transactions_by_budget_line: Array<{
    budget_line_ref: {
      type: 'catalog_path'
      category_name: string
      subcategory_name: string
      product_name: string
    }
    transactions: Array<SeedTransaction>
  }>
}

export type SeedTransaction = {
  supplier_key: string | null
  transaction_type: TransactionType
  amount_ht: string
  vat_rate: string
  amount_vat: string
  amount_ttc: string
  issued_date: string
  due_date: string | null
  payment_date: string | null
  description: string
  quote_status: QuoteStatus | null
  invoice_status: InvoiceStatus | null
  payment_method: PaymentMethod | null
  select_as_budget: boolean
}

export type ProjectViewModel = {
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

export type TemplateViewModel = {
  id: number
  name: string
  project_id: string
}

export type SupplierContactViewModel = {
  id: string
  supplier_id: string
  name: string | null
  phone_number: string | null
  email: string | null
  is_primary: boolean
  created_at: string | null
  updated_at: string | null
}

export type SupplierRowViewModel = {
  id: string
  user_id: string
  name: string
  siret: string | null
  comment: string
  contacts: SupplierContactViewModel[]
  created_at: string | null
  updated_at: string | null
  deleted_at: string | null
}

export type TransactionViewModel = {
  id: string
  budget_line_id: string
  supplier_id: string | null
  supplier_name: string | null
  transaction_type: TransactionType
  amount_ht: number
  vat_rate: number
  amount_vat: number
  amount_ttc: number
  issued_date: string
  due_date: string | null
  payment_date: string | null
  description: string
  quote_status: QuoteStatus | null
  invoice_status: InvoiceStatus | null
  invoice_type: InvoiceType | null
  payment_method: PaymentMethod | null
  select_as_budget: boolean
  document_state: DocumentDisplayState
}

export type BudgetLineSummaryViewModel = {
  budget_line_id: string
  name: string
  item_type: BudgetLineType
  selected_quote_transaction_id: string | null
  selected_diy_estimate_transaction_id: string | null
  selected_budget_amount_ttc: number
  quote_amount_ttc: number
  validated_quote_amount_ttc: number
  diy_estimate_amount_ttc: number
  actual_cost_amount_ttc: number
  paid_invoice_amount_ttc: number
  unpaid_invoice_amount_ttc: number
  on_hold_invoice_amount_ttc: number
  selected_budget_variance_ttc: number
  transactions: TransactionViewModel[]
}

export type ProductSummaryViewModel = {
  product_id: string
  product_name: string
  subcategory_name: string
  category_name: string
  selected_budget_amount_ttc: number
  actual_cost_amount_ttc: number
  paid_invoice_amount_ttc: number
  unpaid_invoice_amount_ttc: number
  on_hold_invoice_amount_ttc: number
  selected_budget_variance_ttc: number
  budget_lines: BudgetLineSummaryViewModel[]
}

export type BudgetCategoryViewModel = {
  category_id: string
  category_name: string
  selected_budget_amount_ttc: number
  actual_cost_amount_ttc: number
  products: ProductSummaryViewModel[]
}

export type FinancialSummaryViewModel = {
  selected_budget_amount_ttc: number
  selected_quote_budget_amount_ttc: number
  selected_diy_budget_amount_ttc: number
  quote_amount_ttc: number
  validated_quote_amount_ttc: number
  diy_estimate_amount_ttc: number
  actual_cost_amount_ttc: number
  paid_invoice_amount_ttc: number
  unpaid_invoice_amount_ttc: number
  on_hold_invoice_amount_ttc: number
  selected_budget_variance_ttc: number
  selected_quote_budget_variance_ttc: number
  quote_count: number
  validated_quote_count: number
  diy_estimate_count: number
  invoice_count: number
  products: ProductSummaryViewModel[]
}

export type BudgetWorkspaceViewModel = {
  project: ProjectViewModel
  templates: TemplateViewModel[]
  categories: BudgetCategoryViewModel[]
  financialSummary: FinancialSummaryViewModel
  transactions: TransactionViewModel[]
}

export type DocumentRowViewModel = {
  id: string
  transaction_id: string
  user_id: string
  original_filename: string
  stored_filename: string
  file_path: string | null
  mime_type: string
  file_size: number
  created_at: string
  updated_at: string
  deleted_at: string | null
  state: DocumentDisplayState
  transaction_type: TransactionType
  transaction_description: string
}

export type DocumentsViewModel = {
  documents: DocumentRowViewModel[]
}

export type DashboardViewModel = {
  project: ProjectViewModel
  financialSummary: FinancialSummaryViewModel
  recentTransactions: TransactionViewModel[]
  varianceProducts: ProductSummaryViewModel[]
  invoiceStatusTotals: Array<{
    status: InvoiceStatus
    amount_ttc: number
  }>
  transactionCounts: Array<{
    transaction_type: TransactionType
    count: number
  }>
  monthlyInvoiceActivity: Array<{
    month: string
    amount_ttc: number
  }>
  categoryBudgetActual: Array<{
    category_name: string
    selected_budget_amount_ttc: number
    actual_cost_amount_ttc: number
  }>
}
