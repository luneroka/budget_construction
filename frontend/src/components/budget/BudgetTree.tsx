import { Fragment } from 'react'

import type { ViewedTransactionContext } from '@/components/budget/TransactionModal'
import {
  BudgetLineContextRow,
  BudgetLineRow,
  CategoryHeader,
  EmptyProductRow,
  ProductContextRows,
  ProductRow,
  SubcategoryRow,
} from '@/components/budget/BudgetTreeRows'
import { TransactionsPanel } from '@/components/budget/TransactionsPanel'
import type {
  BudgetLineDeleteState,
  BreakdownAction,
  TransactionAction,
} from '@/components/budget/types'
import { Table, TableBody } from '@/components/ui/table'
import type {
  BudgetCategoryViewModel,
  BudgetLineSummaryViewModel,
  TransactionViewModel,
} from '@/demo/types'
import { useBudgetExpansion } from '@/hooks/useBudgetExpansion'
import type { BudgetSelectionState } from '@/lib/budgetViewModel'
import {
  getWholeProductBudgetLine,
  groupProductsBySubcategory,
  isProductEmpty,
} from '@/lib/budgetViewModel'

type BudgetTreeProps = {
  categories: BudgetCategoryViewModel[]
  getBudgetSelection: (line: BudgetLineSummaryViewModel) => BudgetSelectionState
  getLineWithBudgetSelection: (
    line: BudgetLineSummaryViewModel,
  ) => BudgetLineSummaryViewModel
  projectId?: number
  readOnly?: boolean
  onAddBreakdown: (action: BreakdownAction) => void
  onAddFirstTransaction: (action: BreakdownAction) => void
  onAddTransaction: (action: TransactionAction) => void
  onDecomposeProduct: (action: BreakdownAction) => void
  onToggleBudgetSelection: (
    line: BudgetLineSummaryViewModel,
    transaction: TransactionViewModel,
  ) => void
  onRequestDeleteBudgetLine: (context: BudgetLineDeleteState) => void
  onRequestDeleteTransaction: (context: ViewedTransactionContext) => void
  onEditTransaction: (context: ViewedTransactionContext) => void
  onViewTransaction: (context: ViewedTransactionContext) => void
  onViewTransactionDocuments: (transaction: TransactionViewModel) => void
}

export function BudgetTree({
  categories,
  getBudgetSelection,
  getLineWithBudgetSelection,
  projectId,
  readOnly,
  onAddBreakdown,
  onAddFirstTransaction,
  onAddTransaction,
  onDecomposeProduct,
  onToggleBudgetSelection,
  onRequestDeleteBudgetLine,
  onRequestDeleteTransaction,
  onEditTransaction,
  onViewTransaction,
  onViewTransactionDocuments,
}: BudgetTreeProps) {
  const {
    openCategories,
    openSubcategories,
    openProducts,
    openBudgetLines,
    toggleCategory,
    toggleSubcategory,
    toggleProduct,
    toggleBudgetLine,
  } = useBudgetExpansion()

  return (
    <div className="space-y-4">
      {categories.map((category) => {
        const isCategoryOpen = openCategories.has(category.category_id)
        const subcategoryGroups = groupProductsBySubcategory(category.products)

        return (
          <div
            key={category.category_id}
            className="overflow-hidden rounded-lg border border-border bg-card"
          >
            <CategoryHeader
              category={category}
              isOpen={isCategoryOpen}
              onToggle={() => toggleCategory(category.category_id)}
            />
            {isCategoryOpen ? (
              <Table>
                <TableBody>
                  {subcategoryGroups.map((group) => {
                    const subcategoryId = `${category.category_id}:${group.name}`
                    const isSubcategoryOpen =
                      openSubcategories.has(subcategoryId)

                    return (
                      <Fragment key={group.name}>
                        <SubcategoryRow
                          group={group}
                          isOpen={isSubcategoryOpen}
                          onToggle={() => toggleSubcategory(subcategoryId)}
                        />
                        {isSubcategoryOpen
                          ? group.products.map((product) => {
                              const isProductOpen = openProducts.has(
                                product.product_id,
                              )
                              const wholeProductLine =
                                getWholeProductBudgetLine(product)
                              const selectedWholeProductLine = wholeProductLine
                                ? getLineWithBudgetSelection(wholeProductLine)
                                : null
                              const isEmptyProduct = isProductEmpty(product)

                              return (
                                <Fragment key={product.product_id}>
                                  <ProductRow
                                    product={product}
                                    isOpen={isProductOpen}
                                    onToggle={() =>
                                      toggleProduct(product.product_id)
                                    }
                                  />
                                  {isProductOpen ? (
                                    isEmptyProduct ? (
                                      <EmptyProductRow
                                        product={product}
                                        readOnly={readOnly}
                                        onAddFirstTransaction={
                                          onAddFirstTransaction
                                        }
                                      />
                                    ) : (
                                      <>
                                        <ProductContextRows
                                          product={product}
                                          line={selectedWholeProductLine}
                                          readOnly={readOnly}
                                          onAddBreakdown={onAddBreakdown}
                                          onAddTransaction={onAddTransaction}
                                          onDecomposeProduct={
                                            onDecomposeProduct
                                          }
                                        />
                                        {selectedWholeProductLine ? (
                                          <TransactionsPanel
                                            transactions={
                                              selectedWholeProductLine.transactions
                                            }
                                            budgetLine={
                                              selectedWholeProductLine
                                            }
                                            budgetSelection={getBudgetSelection(
                                              selectedWholeProductLine,
                                            )}
                                            projectId={projectId}
                                            product={product}
                                            readOnly={readOnly}
                                            onToggleBudgetSelection={
                                              onToggleBudgetSelection
                                            }
                                            onRequestDeleteTransaction={
                                              onRequestDeleteTransaction
                                            }
                                            onEditTransaction={
                                              onEditTransaction
                                            }
                                            onViewTransaction={
                                              onViewTransaction
                                            }
                                            onViewTransactionDocuments={
                                              onViewTransactionDocuments
                                            }
                                          />
                                        ) : (
                                          product.budget_lines.map((line) => {
                                            const isLineOpen =
                                              openBudgetLines.has(
                                                line.budget_line_id,
                                              )
                                            const selectedLine =
                                              getLineWithBudgetSelection(line)

                                            return (
                                              <Fragment
                                                key={line.budget_line_id}
                                              >
                                                <BudgetLineRow
                                                  line={selectedLine}
                                                  product={product}
                                                  isOpen={isLineOpen}
                                                  readOnly={readOnly}
                                                  onRequestDelete={
                                                    onRequestDeleteBudgetLine
                                                  }
                                                  onToggle={() =>
                                                    toggleBudgetLine(
                                                      line.budget_line_id,
                                                    )
                                                  }
                                                />
                                                {isLineOpen ? (
                                                  <>
                                                    <BudgetLineContextRow
                                                      line={selectedLine}
                                                      product={product}
                                                      readOnly={readOnly}
                                                      onAddTransaction={
                                                        onAddTransaction
                                                      }
                                                    />
                                                    <TransactionsPanel
                                                      transactions={
                                                        selectedLine.transactions
                                                      }
                                                      budgetLine={selectedLine}
                                                      budgetSelection={getBudgetSelection(
                                                        selectedLine,
                                                      )}
                                                      projectId={projectId}
                                                      product={product}
                                                      readOnly={readOnly}
                                                      onToggleBudgetSelection={
                                                        onToggleBudgetSelection
                                                      }
                                                      onRequestDeleteTransaction={
                                                        onRequestDeleteTransaction
                                                      }
                                                      onEditTransaction={
                                                        onEditTransaction
                                                      }
                                                      onViewTransaction={
                                                        onViewTransaction
                                                      }
                                                      onViewTransactionDocuments={
                                                        onViewTransactionDocuments
                                                      }
                                                    />
                                                  </>
                                                ) : null}
                                              </Fragment>
                                            )
                                          })
                                        )}
                                      </>
                                    )
                                  ) : null}
                                </Fragment>
                              )
                            })
                          : null}
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
