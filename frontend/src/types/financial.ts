import type { Product } from '@/types/budget'

export type FinancialSummary = {
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
  products: Product[]
}
