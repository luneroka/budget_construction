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
  // One product open at a time, and within it one sub-product at a time:
  // opening either collapses the one that was open (the budget page is an
  // accordion at both levels).
  const [openProductId, setOpenProductId] = useState<string | null>(null)
  const [openBudgetLineId, setOpenBudgetLineId] = useState<string | null>(null)
  const openCategory = useCallback(
    (id: string) => setOpenCategories((current) => new Set(current).add(id)),
    [],
  )
  const openSubcategory = useCallback(
    (id: string) => setOpenSubcategories((current) => new Set(current).add(id)),
    [],
  )
  const openProduct = useCallback((id: string) => setOpenProductId(id), [])
  const openBudgetLine = useCallback(
    (id: string) => setOpenBudgetLineId(id),
    [],
  )
  const closeBudgetLines = useCallback(
    (ids: string[]) =>
      setOpenBudgetLineId((current) =>
        current !== null && ids.includes(current) ? null : current,
      ),
    [],
  )
  const collapseAllProducts = useCallback(() => {
    setOpenProductId(null)
    setOpenBudgetLineId(null)
  }, [])
  const toggleCategory = useCallback(
    (id: string) => setOpenCategories((current) => toggleSetValue(current, id)),
    [],
  )
  const toggleSubcategory = useCallback(
    (id: string) =>
      setOpenSubcategories((current) => toggleSetValue(current, id)),
    [],
  )
  const toggleProduct = useCallback(
    (id: string) => setOpenProductId((current) => (current === id ? null : id)),
    [],
  )
  const toggleBudgetLine = useCallback(
    (id: string) =>
      setOpenBudgetLineId((current) => (current === id ? null : id)),
    [],
  )

  return {
    openCategories,
    openSubcategories,
    openProductId,
    openBudgetLineId,
    openCategory,
    openSubcategory,
    openProduct,
    openBudgetLine,
    closeBudgetLines,
    collapseAllProducts,
    toggleCategory,
    toggleSubcategory,
    toggleProduct,
    toggleBudgetLine,
  }
}
