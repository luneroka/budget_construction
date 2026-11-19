import type { SupplierDocumentType } from '@/api/types'

// In the order the forms and the Synthèse card list them.
export const SUPPLIER_DOCUMENT_TYPES: SupplierDocumentType[] = [
  'rib',
  'kbis',
  'decennial_insurance',
  'urssaf_certificate',
  'other',
]

export const supplierDocumentTypeLabels: Record<SupplierDocumentType, string> =
  {
    rib: 'RIB',
    kbis: 'Kbis',
    decennial_insurance: 'Attestation décennale',
    urssaf_certificate: 'Attestation URSSAF',
    other: 'Autre',
  }

export type ExpirySignal = 'expired' | 'expiring_soon'

export const expirySignalLabels: Record<ExpirySignal, string> = {
  expired: 'Expiré',
  expiring_soon: 'Expire bientôt',
}

// « Expire bientôt » from today through this many days ahead.
export const EXPIRING_SOON_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

/** The user's own date today, as YYYY-MM-DD. */
export function localToday(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function dayNumber(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number)
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS)
}

// A document is valid through its expiry date: expired from the day after,
// « bientôt » from 30 days before it to the day itself. Dates only, against
// the user's own today, so midnight is the user's midnight.
export function expirySignal(
  expiryDate: string | null,
  today: string = localToday(),
): ExpirySignal | null {
  if (!expiryDate) return null

  const daysLeft = dayNumber(expiryDate) - dayNumber(today)
  if (daysLeft < 0) return 'expired'
  if (daysLeft <= EXPIRING_SOON_DAYS) return 'expiring_soon'
  return null
}

// The document whose expiry comes first, an expired one included: what the
// Synthèse card shows as the next deadline. Null when none has a date.
export function nextExpiringDocument<T extends { expiry_date: string | null }>(
  documents: T[],
): T | null {
  return documents.reduce<T | null>((soonest, document) => {
    if (!document.expiry_date) return soonest
    if (!soonest?.expiry_date) return document
    return document.expiry_date < soonest.expiry_date ? document : soonest
  }, null)
}

// The dashboard's « Documents fournisseurs » widget: the documents expired or
// expiring within 30 days, with their signal, in the order given (the API
// sorts them by expiry date). A document without a date never shows.
export function documentsToRenew<T extends { expiry_date: string | null }>(
  documents: T[],
  today: string = localToday(),
): Array<T & { signal: ExpirySignal }> {
  return documents.flatMap((document) => {
    const signal = expirySignal(document.expiry_date, today)
    return signal ? [{ ...document, signal }] : []
  })
}
