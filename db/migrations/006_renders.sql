-- 006_renders.sql
-- A third landing document: a gallery of renders (images), alongside the floor
-- plan and brochure.

alter table documents drop constraint if exists documents_type_check;
alter table documents add constraint documents_type_check check (type in ('floor_plan', 'brochure', 'renders'));
