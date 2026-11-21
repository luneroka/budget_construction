import { describe, expect, it } from 'vitest'

import {
  documentsToRenew,
  expirySignal,
  localToday,
  nextExpiringDocument,
} from './supplierDocuments'

const today = '2026-11-19'

describe('expirySignal', () => {
  it('is expired the day after the expiry date', () => {
    expect(expirySignal('2026-11-18', today)).toBe('expired')
  })

  it('is still valid, expiring soon, on the expiry date itself', () => {
    expect(expirySignal('2026-11-19', today)).toBe('expiring_soon')
  })

  it('is expiring soon 30 days ahead', () => {
    expect(expirySignal('2026-12-19', today)).toBe('expiring_soon')
  })

  it('has no signal 31 days ahead', () => {
    expect(expirySignal('2026-12-20', today)).toBeNull()
  })

  it('has no signal without a date', () => {
    expect(expirySignal(null, today)).toBeNull()
  })

  it('counts days across a month and a year', () => {
    expect(expirySignal('2027-01-01', '2026-12-02')).toBe('expiring_soon')
    expect(expirySignal('2027-01-02', '2026-12-02')).toBeNull()
  })
})

describe('localToday', () => {
  it('reads the local calendar date', () => {
    expect(localToday(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
  })
})

describe('nextExpiringDocument', () => {
  it('picks the earliest date, an expired one included', () => {
    const documents = [
      { id: 1, expiry_date: '2027-05-01' },
      { id: 2, expiry_date: null },
      { id: 3, expiry_date: '2026-10-01' },
      { id: 4, expiry_date: '2026-12-01' },
    ]

    expect(nextExpiringDocument(documents)?.id).toBe(3)
  })

  it('is null when no document has a date', () => {
    expect(nextExpiringDocument([{ id: 1, expiry_date: null }])).toBeNull()
    expect(nextExpiringDocument([])).toBeNull()
  })
})

describe('documentsToRenew', () => {
  const documents = [
    { id: 1, expiry_date: '2026-11-18' }, // expired yesterday
    { id: 2, expiry_date: '2026-11-19' }, // today
    { id: 3, expiry_date: '2026-12-19' }, // day 30
    { id: 4, expiry_date: '2026-12-20' }, // day 31
    { id: 5, expiry_date: null }, // no date
  ]

  it('keeps the expired and the expiring within 30 days, with their flag', () => {
    expect(documentsToRenew(documents, today)).toEqual([
      { id: 1, expiry_date: '2026-11-18', signal: 'expired' },
      { id: 2, expiry_date: '2026-11-19', signal: 'expiring_soon' },
      { id: 3, expiry_date: '2026-12-19', signal: 'expiring_soon' },
    ])
  })

  it('leaves out day 31 and a document without a date', () => {
    const ids = documentsToRenew(documents, today).map(
      (document) => document.id,
    )
    expect(ids).not.toContain(4)
    expect(ids).not.toContain(5)
  })

  it('is empty when nothing needs renewing', () => {
    expect(documentsToRenew([documents[3], documents[4]], today)).toEqual([])
  })
})
