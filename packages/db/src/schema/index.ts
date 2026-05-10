// Reserved DB schema — exporty.
// Zdroj pravdy je `reserved-docs/13a_db_schema_core.md` až `13e`.
//
// Pravidla:
//   - peníze jako INTEGER haléře (sloupce končí _hellers)
//   - timestampy TIMESTAMPTZ
//   - UUID v7 pro ID (časově řazené, lepší index locality)
//   - tenant_id v každé tenant-scoped tabulce + RLS policy

export * from './tenants';
export * from './branches';
export * from './users';
