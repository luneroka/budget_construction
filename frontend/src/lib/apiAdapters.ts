// API (wire) shapes -> domain shapes used by pages and components.
//
// The domain types use string ids and plain numbers; the API uses numeric ids
// and decimal strings. Every conversion lives here so a page never re-implements
// one (and so they cannot drift).

import type {
  ApiDecimal,
  ProjectFinancialSummaryRead,
  ProjectRead,
  SupplierRead,
  TransactionRead,
} from '@/api/types'
import type { Project, Supplier, Transaction } from '@/types'

export function decimalToNumber(
  value: ApiDecimal | number | null | undefined,
): number {
  if (value == null) return 0
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function projectToDomain(
  project: ProjectRead,
  summary?: Pick<ProjectFinancialSummaryRead, 'selected_budget_amount_ttc'>,
): Project {
  return {
    id: String(project.id),
    user_id: String(project.user_id),
    template_id: project.template_id ?? 0,
    name: project.name,
    description: project.description ?? '',
    location: project.location ?? '',
    start_date: project.start_date ?? '',
    end_date: project.end_date ?? '',
    project_status: project.project_status,
    selected_budget_amount_ttc: summary
      ? decimalToNumber(summary.selected_budget_amount_ttc)
      : 0,
  }
}

export function supplierToDomain(supplier: SupplierRead): Supplier {
  return {
    id: String(supplier.id),
    user_id: String(supplier.user_id),
    name: supplier.name,
    siret: supplier.siret,
    comment: supplier.comment ?? '',
    street: supplier.street,
    complement: supplier.complement,
    postal_code: supplier.postal_code,
    city: supplier.city,
    contacts: supplier.contacts.map((contact) => ({
      id: String(contact.id),
      supplier_id: String(contact.supplier_id),
      name: contact.name,
      phone_number: contact.phone_number,
      email: contact.email,
      is_primary: contact.is_primary,
      created_at: contact.created_at,
      updated_at: contact.updated_at,
    })),
    created_at: supplier.created_at,
    updated_at: supplier.updated_at,
    deleted_at: supplier.deleted_at,
  }
}

export function suppliersToDomain(
  suppliers: SupplierRead[] | undefined,
): Supplier[] {
  return (suppliers ?? []).map(supplierToDomain)
}

export function transactionToDomain(
  transaction: TransactionRead,
  suppliers: SupplierRead[],
): Transaction {
  const supplier = suppliers.find(
    (candidate) => candidate.id === transaction.supplier_id,
  )

  return {
    id: String(transaction.id),
    budget_line_id: String(transaction.budget_line_id),
    supplier_id:
      transaction.supplier_id === null ? null : String(transaction.supplier_id),
    supplier_name: supplier?.name ?? null,
    transaction_type: transaction.transaction_type,
    amount_ht: decimalToNumber(transaction.amount_ht),
    vat_rate: decimalToNumber(transaction.vat_rate),
    amount_vat: decimalToNumber(transaction.amount_vat),
    amount_ttc: decimalToNumber(transaction.amount_ttc),
    issued_date: transaction.issued_date,
    due_date: transaction.due_date,
    payment_date: transaction.payment_date,
    created_at: transaction.created_at,
    updated_at: transaction.updated_at,
    deleted_at: transaction.deleted_at,
    description: transaction.description ?? '',
    quote_status: transaction.quote_status,
    invoice_status: transaction.invoice_status,
    invoice_type: transaction.invoice_type,
    payment_method: transaction.payment_method,
    select_as_budget: transaction.is_selected_budget,
    document_state: transaction.has_documents ? 'attached' : 'missing',
    document_count: transaction.document_count,
  }
}
