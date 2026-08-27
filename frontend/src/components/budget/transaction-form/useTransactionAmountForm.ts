import { useState } from 'react'

import {
  type AmountFields,
  type AmountSource,
  recalculateAmounts,
} from './transactionForm'

// Form state whose HT / VAT rate / TTC fields stay consistent: editing HT or
// the rate recomputes VAT and TTC, editing TTC recomputes HT and VAT. Shared
// by the create and review modals.
export function useTransactionAmountForm<T extends AmountFields>(
  createInitial: () => T,
  options?: { onChange?: () => void },
) {
  const [form, setForm] = useState<T>(createInitial)
  const [amountSource, setAmountSource] = useState<AmountSource>('ht')

  function updateField<K extends keyof T>(key: K, value: T[K]) {
    const nextAmountSource =
      key === 'amount_ttc' ? 'ttc' : key === 'amount_ht' ? 'ht' : amountSource
    if (key === 'amount_ttc' || key === 'amount_ht') {
      setAmountSource(nextAmountSource)
    }

    setForm((current) => {
      const next = { ...current, [key]: value }
      if (key === 'amount_ht' || key === 'amount_ttc' || key === 'vat_rate') {
        return recalculateAmounts(next, nextAmountSource)
      }

      return next
    })
    options?.onChange?.()
  }

  function resetForm(next: T) {
    setForm(next)
    setAmountSource('ht')
  }

  return { form, setForm, updateField, resetForm }
}
