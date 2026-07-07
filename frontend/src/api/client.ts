import axios, { AxiosError, type AxiosRequestConfig } from 'axios'

import { apiConfig } from './config'

export type ApiErrorBody = {
  detail?: string | Array<Record<string, unknown>> | Record<string, unknown>
}

const ERROR_MESSAGES_FR: Record<string, string> = {
  admin_access_required: "Vous n'avez pas accès à cette action.",
  amount_ht_invalid: 'Le montant HT doit être supérieur ou égal à 0.',
  amount_ttc_invalid: 'Le montant TTC doit être supérieur ou égal à 0.',
  amount_ttc_mismatch: 'Le montant TTC ne correspond pas aux montants saisis.',
  amount_ttc_required: 'Le montant TTC est obligatoire.',
  amount_vat_invalid: 'Le montant de TVA doit être supérieur ou égal à 0.',
  amount_vat_mismatch:
    'Le montant de TVA ne correspond pas aux montants saisis.',
  bad_request: 'La demande est invalide.',
  breakdown_name_conflict:
    'Ce nom de sous-produit existe déjà pour ce produit.',
  breakdown_names_duplicate: 'Les noms de sous-produits doivent être uniques.',
  budget_line_item_mode_conflict:
    'Ce produit doit être géré soit en un seul poste, soit en sous-produits, mais pas les deux.',
  budget_line_name_required: 'Le nom du poste de budget est obligatoire.',
  budget_line_not_found: 'Ce poste de budget est introuvable.',
  budget_line_type_required: 'Le type de poste de budget est obligatoire.',
  budget_transaction_already_selected:
    'Cette transaction est déjà sélectionnée comme budget ailleurs.',
  category_not_found: 'Cette catégorie est introuvable.',
  conversion_existing_line_name_not_allowed:
    'Le renommage du poste existant n’est pas autorisé dans ce cas.',
  conversion_strategy_required:
    'Choisissez comment convertir le poste existant avant de continuer.',
  credentials_invalid: 'Identifiants incorrects.',
  document_delete_failed: 'Le document n’a pas pu être supprimé.',
  document_metadata_save_failed:
    'Le document a été envoyé, mais ses informations n’ont pas pu être enregistrées.',
  document_must_be_deleted_before_permanent_delete:
    'Le document doit d’abord être supprimé avant sa suppression définitive.',
  document_not_found: 'Ce document est introuvable.',
  document_upload_failed: 'Le document n’a pas pu être téléversé.',
  due_date_before_issued_date:
    'La date d’échéance doit être postérieure ou égale à la date de transaction.',
  due_date_not_allowed:
    'La date d’échéance est disponible uniquement pour les devis et les factures.',
  email_already_exists: 'Un compte existe déjà avec cet email.',
  external_service_error:
    'Un service externe est momentanément indisponible. Réessayez plus tard.',
  file_content_invalid:
    'Le contenu du fichier est invalide ou non pris en charge.',
  file_empty: 'Le fichier est vide.',
  file_extension_missing: 'Le fichier doit avoir une extension.',
  file_extension_mismatch:
    'L’extension du fichier ne correspond pas à son contenu.',
  file_extension_unsupported: 'Ce type de fichier n’est pas pris en charge.',
  file_name_missing: 'Le nom du fichier est manquant.',
  file_too_large: 'Le fichier est trop volumineux.',
  forbidden: "Vous n'avez pas accès à cette ressource.",
  inactive_user: 'Ce compte est désactivé.',
  internal_server_error:
    'Une erreur serveur est survenue. Réessayez dans quelques instants.',
  invoice_status_not_allowed:
    'Le statut de facture est disponible uniquement pour les factures.',
  invoice_status_required: 'Le statut de la facture est obligatoire.',
  invoice_type_not_allowed:
    'Le type de facture est disponible uniquement pour les factures.',
  invoice_type_required: 'Le type de facture est obligatoire.',
  last_admin_deactivate_forbidden:
    'Impossible de désactiver le dernier administrateur.',
  last_admin_delete_forbidden:
    'Impossible de supprimer le dernier administrateur.',
  not_authenticated: 'Connectez-vous pour continuer.',
  not_found: 'La ressource demandée est introuvable.',
  password_reset_token_invalid:
    'Le lien de réinitialisation est invalide ou a expiré.',
  payment_date_before_issued_date:
    'La date de paiement doit être postérieure ou égale à la date de transaction.',
  payment_date_not_allowed:
    'La date de paiement est disponible uniquement pour les factures.',
  payment_date_requires_paid_invoice:
    'La date de paiement est disponible uniquement pour une facture payée.',
  payment_date_required:
    'La date de paiement est obligatoire pour une facture payée.',
  payment_method_not_allowed:
    'Le moyen de paiement est disponible uniquement pour les factures.',
  product_already_budgeted_with_breakdowns:
    'Ce produit est déjà géré avec des sous-produits.',
  product_breakdown_name_required: 'Ajoutez au moins un nom de sous-produit.',
  product_budget_line_ambiguous:
    'Sélectionnez un sous-produit précis pour cette transaction.',
  product_budget_line_missing:
    'Aucun poste de budget actif n’existe encore pour ce produit.',
  product_line_not_found:
    'Le poste de budget du produit entier est introuvable.',
  product_not_available_in_template:
    'Ce produit n’est pas disponible dans le modèle de ce projet.',
  product_not_found: 'Ce produit est introuvable.',
  product_not_found_or_inactive: 'Ce produit est introuvable ou inactif.',
  project_already_has_template: 'Ce projet utilise déjà un modèle.',
  project_date_range_invalid:
    'La date de fin doit être postérieure ou égale à la date de début.',
  project_missing_template:
    'Ce projet doit avoir un modèle avant de créer des postes de budget.',
  project_name_conflict: 'Un projet porte déjà ce nom.',
  project_not_found: 'Ce projet est introuvable.',
  project_status_required: 'Le statut du projet est obligatoire.',
  quote_status_not_allowed:
    'Le statut de devis est disponible uniquement pour les devis.',
  quote_status_required: 'Le statut du devis est obligatoire.',
  request_conflict:
    'Cette action entre en conflit avec des données existantes.',
  request_validation_failed: 'Certains champs sont invalides.',
  selected_budget_quote_must_be_validated:
    'Seuls les devis validés peuvent être sélectionnés comme budget.',
  selected_budget_quote_status_locked:
    'Un devis sélectionné comme budget doit rester validé.',
  self_delete_endpoint_required:
    'Utilisez l’action de suppression de votre propre compte.',
  self_service_endpoint_required:
    'Utilisez l’action dédiée à votre propre compte.',
  subcategory_not_found: 'Cette sous-catégorie est introuvable.',
  supplier_name_conflict: 'Un fournisseur porte déjà ce nom.',
  supplier_not_found: 'Ce fournisseur est introuvable.',
  supplier_not_found_or_inactive: 'Ce fournisseur est introuvable ou inactif.',
  template_item_not_found: 'Cet élément de modèle est introuvable.',
  template_name_conflict: 'Un modèle porte déjà ce nom.',
  template_not_found: 'Ce modèle est introuvable.',
  template_not_found_or_inactive: 'Ce modèle est introuvable ou inactif.',
  template_product_duplicate: 'Ce produit est déjà présent dans ce modèle.',
  template_whole_product_duplicate:
    'Ce modèle contient déjà un poste produit entier pour ce produit.',
  transaction_not_found: 'Cette transaction est introuvable.',
  unauthorized: 'Votre session a expiré. Reconnectez-vous pour continuer.',
  user_email_conflict: 'Un utilisateur existe déjà avec cet email.',
  user_must_be_deleted_before_permanent_delete:
    'L’utilisateur doit d’abord être supprimé avant sa suppression définitive.',
  user_not_deleted: 'Cet utilisateur n’est pas supprimé.',
  user_not_found: 'Cet utilisateur est introuvable.',
  vat_rate_invalid: 'Le taux de TVA doit être supérieur ou égal à 0.',
}

let accessToken: string | null = null
let unauthorizedHandler: (() => void) | null = null

export function setApiAccessToken(token: string | null) {
  accessToken = token
}

export function setApiUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler
}

export const apiClient = axios.create({
  baseURL: apiConfig.baseUrl,
  headers: {
    Accept: 'application/json',
  },
})

apiClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }

  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      unauthorizedHandler?.()
    }

    return Promise.reject(error)
  },
)

export async function apiGet<TResponse>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<TResponse> {
  const response = await apiClient.get<TResponse>(url, config)
  return response.data
}

export async function apiPost<TResponse, TBody = unknown>(
  url: string,
  body: TBody,
  config?: AxiosRequestConfig,
): Promise<TResponse> {
  const response = await apiClient.post<TResponse>(url, body, config)
  return response.data
}

export async function apiPatch<TResponse, TBody = unknown>(
  url: string,
  body: TBody,
  config?: AxiosRequestConfig,
): Promise<TResponse> {
  const response = await apiClient.patch<TResponse>(url, body, config)
  return response.data
}

export async function apiDelete<TResponse = void>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<TResponse> {
  const response = await apiClient.delete<TResponse>(url, config)
  return response.data
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function getApiErrorMessage(error: unknown): string {
  if (error instanceof Error && !axios.isAxiosError(error)) {
    return error.message
  }

  if (!axios.isAxiosError<ApiErrorBody>(error)) {
    return 'Une erreur inattendue est survenue.'
  }

  const detail = error.response?.data?.detail

  if (typeof detail === 'string') {
    return ERROR_MESSAGES_FR[detail] ?? detail
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => item.msg)
      .filter((message): message is string => typeof message === 'string')

    if (messages.length > 0) {
      return messages.join(' ')
    }
  }

  if (detail && !Array.isArray(detail)) {
    const code = typeof detail.code === 'string' ? detail.code : null
    if (code && ERROR_MESSAGES_FR[code]) {
      return ERROR_MESSAGES_FR[code]
    }

    const context = detail.context
    if (
      isRecord(context) &&
      Array.isArray(context.errors) &&
      context.errors.length > 0
    ) {
      return 'Certains champs sont invalides.'
    }

    if (typeof detail.message === 'string') {
      return detail.message
    }
  }

  if (error.response?.status) {
    const fallbackCodeByStatus: Record<number, string> = {
      400: 'bad_request',
      401: 'unauthorized',
      403: 'forbidden',
      404: 'not_found',
      409: 'request_conflict',
      422: 'request_validation_failed',
      500: 'internal_server_error',
      502: 'external_service_error',
    }
    const fallbackCode = fallbackCodeByStatus[error.response.status]
    if (fallbackCode) {
      return ERROR_MESSAGES_FR[fallbackCode]
    }
  }

  if (!error.response) {
    return 'Impossible de joindre le serveur. Vérifiez votre connexion.'
  }

  return 'Une erreur inattendue est survenue.'
}

export type ApiError = AxiosError<ApiErrorBody>
