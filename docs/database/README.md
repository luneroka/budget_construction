# Database Diagram

The database structure is documented in [`schema.dbml`](./schema.dbml). The DBML
source can be imported into [dbdiagram.io](https://dbdiagram.io/) to update the
diagram.

![Database diagram](./diagram.png)

## Supplier Contacts

`suppliers` stores supplier companies. Contact people are normalized into
`supplier_contacts` so a company can have one or many contacts without adding
duplicated columns such as `contact_name_2` or storing JSON blobs.

Each `supplier_contacts` row belongs to one supplier with `ON DELETE CASCADE`.
`is_primary` identifies the contact shown by supplier list views and used as the
default contact for a company. API validation requires exactly one primary
contact whenever a supplier contact list is created or replaced, and the
database adds a partial unique index on `supplier_id` where `is_primary IS TRUE`
to prevent multiple primary contacts for the same supplier.

The normalization migration creates `supplier_contacts`, copies existing
`suppliers.contact_name`, `suppliers.phone_number`, and `suppliers.email` into a
single primary contact per supplier when any of those legacy values are present,
then drops the old supplier contact columns. Downgrade restores the selected
primary contact to the old flat columns; additional non-primary contacts cannot
be represented in the previous schema.
