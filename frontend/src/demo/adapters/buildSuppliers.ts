import type {
  PowerBiSeed,
  SupplierRowViewModel,
  SupplierTableViewModel,
} from '@/demo/types'

export function buildSuppliers(seed: PowerBiSeed): SupplierTableViewModel {
  return {
    suppliers: seed.suppliers.map<SupplierRowViewModel>((supplier) => ({
      id: supplier.key,
      user_id: seed.user.key,
      name: supplier.name,
      siret: null,
      email: supplier.email,
      contact_name: supplier.contact_name,
      phone_number: supplier.phone_number,
      comment: supplier.comment,
      created_at: null,
      deleted_at: null,
    })),
  }
}
