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
      comment: supplier.comment,
      contacts: [
        {
          id: `${supplier.key}-primary-contact`,
          supplier_id: supplier.key,
          name: supplier.contact_name,
          phone_number: supplier.phone_number,
          email: supplier.email,
          is_primary: true,
          created_at: null,
          updated_at: null,
        },
      ],
      created_at: null,
      updated_at: null,
      deleted_at: null,
    })),
  }
}
