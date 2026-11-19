-- 004_background_music.sql
-- Audio (MP3) files in the media library, and an optional background music track
-- for the public site. Its volume lives in projects.settings ("musicVolume").

alter table assets drop constraint if exists assets_category_check;
alter table assets add constraint assets_category_check
  check (category in ('panorama', 'image', 'floor_plan_image', 'pdf', 'audio'));

alter table projects add column if not exists music_asset_id uuid references assets(id) on delete restrict;
