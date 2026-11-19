export type ApiDate = string
export type ApiDateTime = string
export type ApiDecimal = string

export type ProjectStatus = 'draft' | 'active' | 'completed' | 'archived'
export type TransactionType = 'quote' | 'invoice'
export type QuoteStatus =
  'to_confirm' | 'to_negotiate' | 'validated' | 'rejected'
export type InvoiceStatus = 'unpaid' | 'on_hold' | 'paid'
export type InvoiceType = 'full' | 'deposit' | 'interim' | 'balance'
export type PaymentMethod = 'cash' | 'card' | 'wire'

export type TokenRead = {
  access_token: string
}

export type UserRead = {
  id: number
  name: string
  email: string
  is_admin: boolean
  created_at: ApiDateTime
  updated_at: ApiDateTime | null
  deleted_at: ApiDateTime | null
}

export type AdminUserRead = UserRead & {
  is_active: boolean
}

export type AdminUserCreate = {
  name: string
  email: string
}

export type AdminUserUpdate = {
  name?: string
  email?: string
  is_active?: boolean
}

export type ProjectRead = {
  id: number
  user_id: number
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

export type ProjectCreate = {
  name: string
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
  rne_number?: string | null
  comment?: string | null
  street?: string | null
  complement?: string | null
  postal_code?: string | null
  city?: string | null
  contacts: SupplierContactCreate[]
}

export type SupplierUpdate = {
  name?: string | null
  siret?: string | null
  rne_number?: string | null
  comment?: string | null
  street?: string | null
  complement?: string | null
  postal_code?: string | null
  city?: string | null
  contacts?: SupplierContactUpdate[] | null
}

export type SupplierRead = {
  id: number
  user_id: number
  name: string
  siret: string | null
  rne_number: string | null
  comment: string | null
  street: string | null
  complement: string | null
  postal_code: string | null
  city: string | null
  contacts: SupplierContactRead[]
  created_at: ApiDateTime
  updated_at: ApiDateTime
  deleted_at: ApiDateTime | null
}

export type GlobalLotRead = {
  id: number
  code: string
  designation: string
  sort_order: number
}

export type GlobalLotUpdate = {
  code?: string
  designation?: string
}

export type ProjectLotRead = {
  id: number
  project_id: number | null
  code: string
  designation: string
  is_global: boolean
  is_hidden: boolean
  active_transaction_count: number
}

export type LotCreate = {
  code: string
  designation: string
}

export type SupplierLotRead = {
  project_id: number
  supplier_id: number
  lot_id: number
}

// The money model: « Coût prévu » is, per supplier and per lot, the larger of
// its validated quotes and its invoices, added up over the groups; « Facturé »
// is every active invoice, split « Payé » and « À payer » (unpaid + on hold).
// The validated quotes stay as a reference figure. All computed by the API.
export type FinancialTotalsRead = {
  planned_cost_ttc: ApiDecimal
  validated_quote_amount_ttc: ApiDecimal
  invoiced_amount_ttc: ApiDecimal
  paid_invoice_amount_ttc: ApiDecimal
  unpaid_invoice_amount_ttc: ApiDecimal
  on_hold_invoice_amount_ttc: ApiDecimal
  to_pay_amount_ttc: ApiDecimal
  quote_count: number
  validated_quote_count: number
  invoice_count: number
}

/** One supplier's group in one lot; `supplier_id` null is « Sans fournisseur ». */
export type LotSupplierFinancialSummaryRead = FinancialTotalsRead & {
  supplier_id: number | null
}

export type LotFinancialSummaryRead = FinancialTotalsRead & {
  lot_id: number
  project_id: number | null
  code: string
  designation: string
  is_global: boolean
  suppliers: LotSupplierFinancialSummaryRead[]
}

/** A supplier over the project's visible lots. */
export type SupplierFinancialSummaryRead = FinancialTotalsRead & {
  supplier_id: number
}

export type ProjectFinancialSummaryRead = FinancialTotalsRead & {
  project_id: number
  generated_at: ApiDateTime
  lots: LotFinancialSummaryRead[]
  suppliers: SupplierFinancialSummaryRead[]
}

export type DashboardFinancialOverviewRead = {
  project_id: number
  generated_at: ApiDateTime
  validated_quote_amount_ttc: ApiDecimal
  invoiced_amount_ttc: ApiDecimal
  remaining_to_invoice_ttc: ApiDecimal
  completion_percentage: ApiDecimal
}

export type DashboardSpendingOverTimePointRead = {
  month: string
  invoiced_amount_ttc: ApiDecimal
}

export type DashboardLotBudgetInvoicedRead = {
  lot_id: number
  lot_code: string
  lot_designation: string
  validated_quote_amount_ttc: ApiDecimal
  invoiced_amount_ttc: ApiDecimal
}

export type DashboardLotDistributionRead = {
  lot_id: number
  lot_code: string
  lot_designation: string
  invoiced_amount_ttc: ApiDecimal
}

export type DashboardSupplierDistributionRead = {
  supplier_id: number | null
  supplier_name: string
  invoiced_amount_ttc: ApiDecimal
}

export type DashboardTransactionWidgetItemRead = {
  transaction_id: number
  lot_id: number
  lot_code: string
  lot_designation: string
  transaction_type: TransactionType
  title: string | null
  reference: string | null
  amount_ttc: ApiDecimal
  issued_date: ApiDate
  due_date: ApiDate | null
  description: string | null
  quote_status: QuoteStatus | null
  invoice_status: InvoiceStatus | null
  supplier_name: string | null
  has_documents: boolean
}

export type DashboardTransactionWidgetRead = {
  count: number
  items: DashboardTransactionWidgetItemRead[]
}

export type DashboardBudgetAlertRead = {
  lot_id: number
  lot_code: string
  lot_designation: string
  validated_quote_amount_ttc: ApiDecimal
  invoiced_amount_ttc: ApiDecimal
  variance_ttc: ApiDecimal
}

export type DashboardBudgetAlertsRead = {
  count: number
  items: DashboardBudgetAlertRead[]
}

export type TransactionBaseWrite = {
  lot_id: number
  supplier_id?: number | null
  transaction_type: TransactionType
  title?: string | null
  reference?: string | null
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

export type TransactionCreate = TransactionBaseWrite

export type TransactionUpdate = {
  lot_id?: number
  supplier_id?: number | null
  title?: string | null
  reference?: string | null
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
  project_id: number
  lot_id: number
  has_documents: boolean
  document_count: number
  supplier_id: number | null
  transaction_type: TransactionType
  title: string | null
  reference: string | null
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

export type ProjectTransactionRead = TransactionRead & {
  lot_code: string
  lot_designation: string
  supplier_name: string | null
  document_original_filenames: string[]
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
  type: 'document'
  project_id: number
  transaction_type: TransactionType
  transaction_title: string | null
  transaction_reference: string | null
  transaction_description: string | null
  supplier_id: number | null
  supplier_name: string | null
  lot_code: string
  lot_designation: string
  amount_ttc: ApiDecimal | null
}

export type SupplierDocumentType =
  'rib' | 'kbis' | 'decennial_insurance' | 'urssaf_certificate' | 'other'

type SupplierDocumentFields = {
  id: number
  supplier_id: number
  user_id: number
  /** Valid through that day; null: « Sans date ». */
  expiry_date: ApiDate | null
  original_filename: string
  stored_filename: string
  file_path: string
  mime_type: string
  file_size: number
  created_at: ApiDateTime
  updated_at: ApiDateTime
  deleted_at: ApiDateTime | null
}

export type SupplierDocumentRead = SupplierDocumentFields & {
  type: SupplierDocumentType
}

// On the Documents page `type` tells transaction documents from supplier
// documents, so the supplier document's own type is `document_type`.
export type SupplierDocumentListRead = SupplierDocumentFields & {
  type: 'supplier_document'
  document_type: SupplierDocumentType
  supplier_name: string
}

export type SupplierDocumentUpdate = {
  type?: SupplierDocumentType
  expiry_date?: ApiDate | null
}

export type DocumentsListItem = DocumentListRead | SupplierDocumentListRead

export type DocumentDownloadUrl = {
  url: string
}

export type TrashTransactionRead = {
  type: 'transaction'
  id: number
  project_id: number
  lot_id: number
  lot_code: string
  lot_designation: string
  transaction_type: TransactionType
  name: string
  title: string | null
  reference: string | null
  supplier_name: string | null
  amount_ttc: ApiDecimal
  deleted_at: ApiDateTime
}

export type TrashDocumentRead = {
  type: 'document'
  id: number
  project_id: number
  transaction_id: number
  name: string
  transaction_name: string
  transaction_type: TransactionType
  transaction_deleted_at: ApiDateTime | null
  supplier_name: string | null
  deleted_at: ApiDateTime
  can_restore: boolean
  restore_blocked_reason: string | null
}

export type TrashSupplierRead = {
  type: 'supplier'
  id: number
  project_id: number
  name: string
  linked_transaction_count: number
  deleted_at: ApiDateTime
}

export type TrashSupplierDocumentRead = {
  type: 'supplier_document'
  id: number
  project_id: number
  supplier_id: number
  name: string
  supplier_name: string
  supplier_deleted_at: ApiDateTime | null
  deleted_at: ApiDateTime
  can_restore: boolean
  restore_blocked_reason: string | null
}

export type TrashItemRead =
  | TrashTransactionRead
  | TrashDocumentRead
  | TrashSupplierRead
  | TrashSupplierDocumentRead
