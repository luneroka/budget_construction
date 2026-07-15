export type TransactionType = 'quote' | 'diy_estimate' | 'invoice'
export type QuoteStatus =
  'to_confirm' | 'to_negotiate' | 'validated' | 'rejected'
export type InvoiceStatus = 'unpaid' | 'on_hold' | 'paid'
export type InvoiceType = 'full' | 'deposit' | 'interim' | 'balance'
export type PaymentMethod = 'cash' | 'card' | 'wire'
export type DocumentDisplayState =
  'attached' | 'missing' | 'deleted' | 'upload_error'

export type Transaction = {
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
  created_at: string | null
  updated_at: string | null
  deleted_at: string | null
  description: string
  quote_status: QuoteStatus | null
  invoice_status: InvoiceStatus | null
  invoice_type: InvoiceType | null
  payment_method: PaymentMethod | null
  select_as_budget: boolean
  document_state: DocumentDisplayState
  document_count: number
}
