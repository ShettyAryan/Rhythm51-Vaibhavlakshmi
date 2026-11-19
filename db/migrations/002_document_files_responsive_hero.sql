-- 002_document_files_responsive_hero.sql
-- 1. Separate landing cover images for tablet and mobile screens (the existing
--    hero_asset_id remains the desktop image and the fallback for the others).
-- 2. Documents (Floor Plan / Brochure) can hold several files — PDFs and images —
--    shown as tabs in the viewer. Existing single files are carried over.

alter table projects add column if not exists hero_tablet_asset_id uuid references assets(id) on delete restrict;
alter table projects add column if not exists hero_mobile_asset_id uuid references assets(id) on delete restrict;

create table if not exists document_files (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references documents(id) on delete cascade,
  asset_id       uuid not null references assets(id) on delete restrict,
  title          text not null default '',
  display_order  integer not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists document_files_document_idx on document_files(document_id, display_order);

insert into document_files (document_id, asset_id, title, display_order)
  select id, asset_id, '', 0 from documents where asset_id is not null;

update documents set asset_id = null where asset_id is not null;
