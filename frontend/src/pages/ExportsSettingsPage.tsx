import { useState } from 'react'
import { Download, FileSpreadsheet } from 'lucide-react'

import { getApiErrorMessage } from '@/api/client'
import {
  type AccountingExportTransactionType,
  useAccountingCsvExportMutation,
} from '@/api/exports'
import { PageHeader } from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import { SettingsBackButton } from '@/components/shared/SettingsBackButton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { downloadBlob } from '@/lib/downloads'
import { notifyError, notifySuccess } from '@/lib/toasts'
import { useAppState } from '@/state/appState'

const transactionTypeOptions: Array<{
  value: AccountingExportTransactionType
  label: string
}> = [
  { value: 'all', label: 'Tous les types' },
  { value: 'invoices', label: 'Factures' },
  { value: 'quotes', label: 'Devis' },
  { value: 'diy_estimates', label: 'Estimations DIY' },
]

export function ExportsSettingsPage() {
  const { selectedProjectId } = useAppState()
  const projectId = Number(selectedProjectId)
  const hasSelectedProject = Number.isInteger(projectId) && projectId > 0
  const exportMutation = useAccountingCsvExportMutation()
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [transactionType, setTransactionType] =
    useState<AccountingExportTransactionType>('all')
  const [formError, setFormError] = useState<string | null>(null)

  async function handleAccountingCsvExport() {
    setFormError(null)

    if (!hasSelectedProject) {
      const message = 'Sélectionnez un projet avant de lancer un export.'
      setFormError(message)
      notifyError(message)
      return
    }

    if (startDate && endDate && endDate < startDate) {
      const message = 'La date de fin doit être postérieure à la date de début.'
      setFormError(message)
      notifyError(message)
      return
    }

    try {
      const exportFile = await exportMutation.mutateAsync({
        projectId,
        params: {
          startDate,
          endDate,
          transactionType,
        },
      })
      downloadBlob(exportFile.blob, exportFile.filename)
      notifySuccess('Export CSV téléchargé.')
    } catch (error) {
      const message = getApiErrorMessage(error)
      setFormError(message)
      notifyError(`Impossible de générer l’export CSV. ${message}`)
    }
  }

  return (
    <section>
      <SettingsBackButton />
      <PageHeader
        title="Exports"
        description="Générez les fichiers utiles au suivi de votre projet."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="CSV"
          description="Un fichier CSV complet pour la comptabilité et l’analyse dans un tableur."
          icon={FileSpreadsheet}
        >
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="export-start-date">Date de début</Label>
                <Input
                  id="export-start-date"
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  disabled={exportMutation.isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="export-end-date">Date de fin</Label>
                <Input
                  id="export-end-date"
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  disabled={exportMutation.isPending}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="export-transaction-type">
                Type de transaction
              </Label>
              <Select
                id="export-transaction-type"
                value={transactionType}
                onChange={(event) =>
                  setTransactionType(
                    event.target.value as AccountingExportTransactionType,
                  )
                }
                disabled={exportMutation.isPending}
              >
                {transactionTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>

            {formError ? (
              <p className="text-sm text-destructive">{formError}</p>
            ) : null}

            <Button
              onClick={handleAccountingCsvExport}
              disabled={!hasSelectedProject || exportMutation.isPending}
            >
              <Download aria-hidden />
              {exportMutation.isPending
                ? 'Génération en cours...'
                : 'Télécharger le CSV'}
            </Button>
          </div>
        </SectionCard>
      </div>
    </section>
  )
}
