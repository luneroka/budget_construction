import type { Transaction } from '@/types/transaction'

export type BudgetLineType = 'product' | 'breakdown'

export type BudgetLine = {
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
  quote_count: number
  validated_quote_count: number
  diy_estimate_count: number
  invoice_count: number
  transactions: Transaction[]
}

export type Product = {
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
  budget_lines: BudgetLine[]
}

export type BudgetCategory = {
  category_id: string
  category_name: string
  selected_budget_amount_ttc: number
  actual_cost_amount_ttc: number
  products: Product[]
}
