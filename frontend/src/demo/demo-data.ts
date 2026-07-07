import catalogSeed from '@/demo/data/catalog.json'
import powerBiSeed from '@/demo/data/powerbi_demo.json'
import { buildDashboard } from '@/demo/adapters/buildDashboard'
import { buildDocuments } from '@/demo/adapters/buildDocuments'
import { buildSuppliers } from '@/demo/adapters/buildSuppliers'
import type { CatalogSeed, PowerBiSeed } from '@/demo/types'

const catalog = catalogSeed as CatalogSeed
const powerBi = powerBiSeed as PowerBiSeed

export const dashboardViewModel = buildDashboard(catalog, powerBi)
export const supplierTableViewModel = buildSuppliers(powerBi)
export const documentsViewModel = buildDocuments(catalog, powerBi)
