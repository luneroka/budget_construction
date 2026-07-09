export type SupplierContact = {
  id: string
  supplier_id: string
  name: string | null
  phone_number: string | null
  email: string | null
  is_primary: boolean
  created_at: string | null
  updated_at: string | null
}

export type Supplier = {
  id: string
  user_id: string
  name: string
  siret: string | null
  comment: string
  contacts: SupplierContact[]
  created_at: string | null
  updated_at: string | null
  deleted_at: string | null
}
