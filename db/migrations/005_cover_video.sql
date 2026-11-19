-- 005_cover_video.sql
-- Video files (MP4 / WebM) in the media library, usable as landing cover media.
-- (Animated GIFs are stored as ordinary images.)

alter table assets drop constraint if exists assets_category_check;
alter table assets add constraint assets_category_check
  check (category in ('panorama', 'image', 'floor_plan_image', 'pdf', 'audio', 'video'));
