-- Wave 1 (change requests #5 + #12): link the standalone do_not_return list
-- to the employees table so the "Mark Do Not Return" action on an active
-- employee can create/sync a single DNR record per employee (idempotent
-- upsert) instead of appending a duplicate row every time it is invoked.
--
-- The do_not_return table was created in 0018_dt_live_data_columns.sql and
-- seeded from the live spreadsheet in 0019 with candidate-style rows that
-- have no matching employees row — so employee_id is nullable and the FK
-- is `on delete set null` (deleting an employee must not erase the DNR
-- history we kept on them). The partial unique index lets the app upsert
-- on employee_id while leaving the legacy spreadsheet rows (employee_id
-- null) untouched and un-deduped.

alter table do_not_return
  add column if not exists employee_id uuid references employees(id) on delete set null;

create unique index if not exists do_not_return_employee_id_key
  on do_not_return (employee_id) where employee_id is not null;
