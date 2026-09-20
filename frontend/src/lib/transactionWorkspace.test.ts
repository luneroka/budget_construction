import { describe, expect, it } from 'vitest'

import type { BudgetLine, Product } from '@/types'

import { subProductName } from './transactionWorkspace'

const product = { product_name: 'Menuiseries' } as Product
const line = (name: string) => ({ name }) as BudgetLine

describe('subProductName', () => {
  it('names the sub-product a transaction sits on', () => {
    expect(subProductName(product, line('Fenêtres'))).toBe('Fenêtres')
  })

  it('says nothing when the line stands for the product itself', () => {
    expect(subProductName(product, line('Menuiseries'))).toBeNull()
    expect(subProductName(product, line(' menuiseries '))).toBeNull()
    expect(subProductName(product, line(''))).toBeNull()
  })
})
