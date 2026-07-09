import type { BudgetCategory } from '@/types/budget'
import type { FinancialSummary } from '@/types/financial'
import type { Project, ProjectTemplate } from '@/types/project'
import type { Transaction } from '@/types/transaction'

export type BudgetWorkspace = {
  project: Project
  templates: ProjectTemplate[]
  categories: BudgetCategory[]
  financialSummary: FinancialSummary
  transactions: Transaction[]
}
