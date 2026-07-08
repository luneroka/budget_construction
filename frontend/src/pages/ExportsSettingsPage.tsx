import { useRef, useState } from 'react'
import { Download, FileImage, FileSpreadsheet, FileText } from 'lucide-react'

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
import {
  captureDashboardPng,
  DASHBOARD_EXPORT_WIDTH,
  dashboardPngFilename,
} from '@/lib/dashboardCapture'
import { downloadBlob } from '@/lib/downloads'
import { notifyError, notifySuccess } from '@/lib/toasts'
import { DashboardPage } from '@/pages/DashboardPage'
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
  const dashboardExportRef = useRef<HTMLDivElement | null>(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [transactionType, setTransactionType] =
    useState<AccountingExportTransactionType>('all')
  const [formError, setFormError] = useState<string | null>(null)
  const [dashboardExportReady, setDashboardExportReady] = useState(false)
  const [dashboardExporting, setDashboardExporting] = useState(false)

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

  async function handleDashboardPngExport() {
    setFormError(null)

    if (!hasSelectedProject) {
      const message = 'Sélectionnez un projet avant de lancer un export.'
      setFormError(message)
      notifyError(message)
      return
    }

    if (!dashboardExportRef.current) {
      const message = 'La zone de capture du tableau de bord est indisponible.'
      setFormError(message)
      notifyError(message)
      return
    }

    if (!dashboardExportReady) {
      const message = 'Le tableau de bord est encore en préparation.'
      setFormError(message)
      notifyError(message)
      return
    }

    setDashboardExporting(true)
    try {
      await new Promise((resolve) => requestAnimationFrame(resolve))
      await new Promise((resolve) => requestAnimationFrame(resolve))
      const blob = await captureDashboardPng(dashboardExportRef.current)
      downloadBlob(blob, dashboardPngFilename(projectId))
      notifySuccess('Export PNG téléchargé.')
    } catch (error) {
      const message = getApiErrorMessage(error)
      setFormError(message)
      notifyError(`Impossible de générer l’export PNG. ${message}`)
    } finally {
      setDashboardExporting(false)
    }
  }

  return (
    <section>
      <SettingsBackButton />
      <PageHeader
        title="Exports"
        description="Générez les fichiers utiles au suivi de votre projet."
      />

      <div className="exports-settings-grid-three grid gap-4">
        <SectionCard
          title="CSV"
          description="Un fichier CSV complet pour la comptabilité et l’analyse dans un tableur."
          icon={FileSpreadsheet}
        >
          <div className="flex h-full flex-col justify-between gap-4">
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
            </div>

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

        <SectionCard
          title="Dashboard PNG"
          description="Une image haute résolution du tableau de bord, prête à partager par email ou dans une présentation."
          icon={FileImage}
        >
          <div className="flex h-full flex-col justify-between gap-4">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                L’export utilise une mise en page desktop fixe avec les
                indicateurs et les graphiques du projet.
              </p>
              {formError ? (
                <p className="text-sm text-destructive">{formError}</p>
              ) : null}
            </div>
            <Button
              onClick={handleDashboardPngExport}
              disabled={
                !hasSelectedProject ||
                !dashboardExportReady ||
                dashboardExporting
              }
              className=""
            >
              <Download aria-hidden />
              {dashboardExporting
                ? 'Génération en cours...'
                : dashboardExportReady
                  ? 'Télécharger le PNG'
                  : 'Préparation du dashboard...'}
            </Button>
          </div>
        </SectionCard>

        <SectionCard
          title="Rapport PDF"
          description="Un rapport synthétique du projet avec chiffres clés, budget et suivi documentaire."
          icon={FileText}
        >
          <div className="flex h-full flex-col justify-between gap-4 opacity-70">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Cette option permettra de générer un document prêt à partager
                avec les parties prenantes du projet.
              </p>
              <div className="space-y-2">
                <Label htmlFor="export-pdf-format">Format</Label>
                <Select id="export-pdf-format" value="summary" disabled>
                  <option value="summary">Rapport synthétique</option>
                </Select>
              </div>
            </div>
            <Button disabled>
              <Download aria-hidden />
              Bientôt disponible
            </Button>
          </div>
        </SectionCard>
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 -z-10"
      >
        <div
          ref={dashboardExportRef}
          className="bg-background p-8 text-foreground"
          style={{
            width: DASHBOARD_EXPORT_WIDTH,
          }}
        >
          <DashboardPage
            includeActionCenter={false}
            exportLayout
            onExportReadyChange={setDashboardExportReady}
          />
        </div>
      </div>
    </section>
  )
}
