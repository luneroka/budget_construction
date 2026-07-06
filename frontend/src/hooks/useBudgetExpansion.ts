import { useState } from 'react'

function toggleSetValue(current: Set<string>, id: string) {
  const next = new Set(current)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

export function useBudgetExpansion() {
  const [openCategories, setOpenCategories] = useState<Set<string>>(
    () => new Set(),
  )
  const [openSubcategories, setOpenSubcategories] = useState<Set<string>>(
    () => new Set(),
  )
  const [openProducts, setOpenProducts] = useState<Set<string>>(() => new Set())
  const [openBudgetLines, setOpenBudgetLines] = useState<Set<string>>(
    () => new Set(),
  )

  return {
    openCategories,
    openSubcategories,
    openProducts,
    openBudgetLines,
    toggleCategory: (id: string) =>
      setOpenCategories((current) => toggleSetValue(current, id)),
    toggleSubcategory: (id: string) =>
      setOpenSubcategories((current) => toggleSetValue(current, id)),
    toggleProduct: (id: string) =>
      setOpenProducts((current) => toggleSetValue(current, id)),
    toggleBudgetLine: (id: string) =>
      setOpenBudgetLines((current) => toggleSetValue(current, id)),
  }
}
