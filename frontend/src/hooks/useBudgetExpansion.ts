import { useCallback, useState } from 'react'

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
  const openCategory = useCallback(
    (id: string) => setOpenCategories((current) => new Set(current).add(id)),
    [],
  )
  const openSubcategory = useCallback(
    (id: string) =>
      setOpenSubcategories((current) => new Set(current).add(id)),
    [],
  )
  const openProduct = useCallback(
    (id: string) => setOpenProducts((current) => new Set(current).add(id)),
    [],
  )
  const openBudgetLine = useCallback(
    (id: string) => setOpenBudgetLines((current) => new Set(current).add(id)),
    [],
  )
  const toggleCategory = useCallback(
    (id: string) =>
      setOpenCategories((current) => toggleSetValue(current, id)),
    [],
  )
  const toggleSubcategory = useCallback(
    (id: string) =>
      setOpenSubcategories((current) => toggleSetValue(current, id)),
    [],
  )
  const toggleProduct = useCallback(
    (id: string) => setOpenProducts((current) => toggleSetValue(current, id)),
    [],
  )
  const toggleBudgetLine = useCallback(
    (id: string) =>
      setOpenBudgetLines((current) => toggleSetValue(current, id)),
    [],
  )

  return {
    openCategories,
    openSubcategories,
    openProducts,
    openBudgetLines,
    openCategory,
    openSubcategory,
    openProduct,
    openBudgetLine,
    toggleCategory,
    toggleSubcategory,
    toggleProduct,
    toggleBudgetLine,
  }
}
