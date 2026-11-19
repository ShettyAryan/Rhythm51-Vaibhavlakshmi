-- 003_hero_tablet_portrait.sql
-- A separate cover image for tablets held upright (portrait). hero_tablet_asset_id
-- is now the landscape tablet image.

alter table projects add column if not exists hero_tablet_portrait_asset_id uuid references assets(id) on delete restrict;
