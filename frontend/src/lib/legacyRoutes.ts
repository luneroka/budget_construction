// « Transactions » became « Devis et factures » (money-model spec): the old
// URLs, bookmarked or open in a tab, land on the new ones with their query
// string and hash. The redirect replaces the history entry.

export const QUOTES_AND_INVOICES_PATH = '/devis-factures'
export const SUPPLIER_QUOTES_AND_INVOICES_SEGMENT = 'devis-factures'

type LocationParts = { search: string; hash: string }

export function quotesAndInvoicesRedirect(location: LocationParts): string {
  return `${QUOTES_AND_INVOICES_PATH}${location.search}${location.hash}`
}

export function supplierQuotesAndInvoicesRedirect(
  supplierId: string | undefined,
  location: LocationParts,
): string {
  return `/suppliers/${supplierId ?? ''}/${SUPPLIER_QUOTES_AND_INVOICES_SEGMENT}${location.search}${location.hash}`
}
