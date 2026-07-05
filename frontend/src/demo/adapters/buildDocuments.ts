import type {
  CatalogSeed,
  DocumentRowViewModel,
  DocumentsViewModel,
  PowerBiSeed,
} from '@/demo/types'
import { buildBudgetWorkspace } from '@/demo/adapters/buildBudgetWorkspace'
import { slugify } from '@/demo/adapters/utils'

export function buildDocuments(
  catalogSeed: CatalogSeed,
  powerBiSeed: PowerBiSeed,
): DocumentsViewModel {
  const workspace = buildBudgetWorkspace(catalogSeed, powerBiSeed)
  const documents = workspace.transactions
    .filter((transaction) => transaction.transaction_type === 'invoice')
    .slice(0, 30)
    .map<DocumentRowViewModel>((transaction) => {
      const baseName = slugify(transaction.description)
      const fileSize = Math.round(transaction.amount_ttc * 12)

      return {
        id: `document-${transaction.id}`,
        transaction_id: transaction.id,
        user_id: workspace.project.user_id,
        original_filename: `${baseName}.pdf`,
        stored_filename: `${baseName}-${transaction.id}.pdf`,
        file_path: null,
        mime_type: 'application/pdf',
        file_size: fileSize,
        created_at: transaction.issued_date,
        updated_at: transaction.issued_date,
        deleted_at: null,
        state: transaction.document_state,
        transaction_description: transaction.description,
      }
    })

  return { documents }
}
