-- 001_initial.sql
-- Core schema for the property tour platform. Plain PostgreSQL (13+) so it runs
-- identically on embedded PGlite (local development) and hosted Postgres / Supabase.
--
-- Angular conventions (see docs/COORDINATES.md):
--   yaw   : degrees, (-180, 180], 0 = centre column of the equirectangular image,
--           positive = clockwise when seen from above (turning right).
--   pitch : degrees, [-90, 90], 0 = horizon, positive = up.
--   fov   : vertical field of view in degrees, [30, 110].
--   marker_x / marker_y : normalised [0,1] floor-plan image coordinates, origin top-left.
--   heading_offset / orientation_offset : degrees added to yaw to obtain the bearing
--           on the floor-plan image (0 = image "up", clockwise positive).

create table if not exists projects (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  name             text not null default '',
  developer_name   text not null default '',
  logo_asset_id    uuid,
  hero_asset_id    uuid,
  hero_headline    text not null default '',
  hero_subtitle    text not null default '',
  show_hero_text   boolean not null default true,
  hero_overlay     real not null default 0.35 check (hero_overlay >= 0 and hero_overlay <= 0.9),
  about_text       text not null default '',
  nav_labels       jsonb not null default '{}'::jsonb,
  theme            jsonb not null default '{}'::jsonb,
  contact          jsonb not null default '{}'::jsonb,
  settings         jsonb not null default '{}'::jsonb,
  status           text not null default 'draft' check (status in ('draft', 'published')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists assets (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  category      text not null check (category in ('panorama', 'image', 'floor_plan_image', 'pdf')),
  status        text not null default 'uploading' check (status in ('uploading', 'ready')),
  storage_key   text,
  pending_key   text,
  file_name     text not null,
  mime_type     text not null,
  file_size     bigint not null default 0 check (file_size >= 0),
  width         integer,
  height        integer,
  version       integer not null default 1,
  -- { variants: { thumb?: {key,width,height}, md?: {...}, lg?: {...} }, pageCount?: n }
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists assets_project_idx on assets(project_id, category, created_at desc);

alter table projects drop constraint if exists projects_logo_fk;
alter table projects add constraint projects_logo_fk foreign key (logo_asset_id) references assets(id) on delete restrict;
alter table projects drop constraint if exists projects_hero_fk;
alter table projects add constraint projects_hero_fk foreign key (hero_asset_id) references assets(id) on delete restrict;

create table if not exists floor_plans (
  id                     uuid primary key default gen_random_uuid(),
  project_id             uuid not null references projects(id) on delete cascade,
  name                   text not null,
  image_asset_id         uuid references assets(id) on delete restrict,
  original_pdf_asset_id  uuid references assets(id) on delete restrict,
  page_number            integer check (page_number is null or page_number >= 1),
  orientation_offset     real not null default 0 check (orientation_offset > -360 and orientation_offset < 360),
  status                 text not null default 'draft' check (status in ('draft', 'published')),
  display_order          integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists floor_plans_project_idx on floor_plans(project_id, display_order);

create table if not exists tours (
  id                        uuid primary key default gen_random_uuid(),
  project_id                uuid not null references projects(id) on delete cascade,
  type                      text not null check (type in ('rooms', 'amenities')),
  name                      text not null,
  description               text not null default '',
  default_access_point_id   uuid,
  status                    text not null default 'draft' check (status in ('draft', 'published')),
  display_order             integer not null default 0,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (project_id, type)
);

create table if not exists tour_groups (
  id                        uuid primary key default gen_random_uuid(),
  tour_id                   uuid not null references tours(id) on delete cascade,
  name                      text not null,
  description               text not null default '',
  thumbnail_asset_id        uuid references assets(id) on delete restrict,
  floor_plan_id             uuid references floor_plans(id) on delete set null,
  default_access_point_id   uuid,
  status                    text not null default 'draft' check (status in ('draft', 'published')),
  display_order             integer not null default 0,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index if not exists tour_groups_tour_idx on tour_groups(tour_id, display_order);

create table if not exists access_points (
  id                   uuid primary key default gen_random_uuid(),
  group_id             uuid not null references tour_groups(id) on delete cascade,
  name                 text not null,
  panorama_asset_id    uuid references assets(id) on delete restrict,
  thumbnail_asset_id   uuid references assets(id) on delete restrict,
  initial_yaw          real not null default 0 check (initial_yaw > -180.0001 and initial_yaw <= 180),
  initial_pitch        real not null default 0 check (initial_pitch >= -90 and initial_pitch <= 90),
  initial_fov          real not null default 75 check (initial_fov >= 30 and initial_fov <= 110),
  floor_plan_id        uuid references floor_plans(id) on delete set null,
  marker_x             real check (marker_x is null or (marker_x >= 0 and marker_x <= 1)),
  marker_y             real check (marker_y is null or (marker_y >= 0 and marker_y <= 1)),
  heading_offset       real not null default 0 check (heading_offset > -360 and heading_offset < 360),
  status               text not null default 'draft' check (status in ('draft', 'published')),
  display_order        integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check ((marker_x is null) = (marker_y is null))
);
create index if not exists access_points_group_idx on access_points(group_id, display_order);

-- Default access points are added after access_points exists to avoid a circular
-- creation dependency: groups/tours are created first, defaults are set later.
alter table tours drop constraint if exists tours_default_ap_fk;
alter table tours add constraint tours_default_ap_fk foreign key (default_access_point_id) references access_points(id) on delete set null;
alter table tour_groups drop constraint if exists groups_default_ap_fk;
alter table tour_groups add constraint groups_default_ap_fk foreign key (default_access_point_id) references access_points(id) on delete set null;

create table if not exists hotspots (
  id                           uuid primary key default gen_random_uuid(),
  source_access_point_id       uuid not null references access_points(id) on delete cascade,
  destination_access_point_id  uuid not null references access_points(id) on delete cascade,
  label                        text not null default '',
  yaw                          real not null check (yaw > -180.0001 and yaw <= 180),
  pitch                        real not null check (pitch >= -90 and pitch <= 90),
  type                         text not null default 'navigate' check (type in ('navigate')),
  style                        text not null default 'ring' check (style in ('ring', 'arrow', 'door')),
  display_order                integer not null default 0,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  check (source_access_point_id <> destination_access_point_id)
);
create index if not exists hotspots_source_idx on hotspots(source_access_point_id, display_order);
create index if not exists hotspots_dest_idx on hotspots(destination_access_point_id);

create table if not exists documents (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  type            text not null check (type in ('floor_plan', 'brochure')),
  asset_id        uuid references assets(id) on delete restrict,
  title           text not null default '',
  status          text not null default 'draft' check (status in ('draft', 'published')),
  allow_download  boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (project_id, type)
);

-- Immutable published snapshots. The newest row per project is what visitors see.
create table if not exists publications (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  snapshot      jsonb not null,
  -- { "<assetId>": { "key": "...", "mime": "...", "variants": { "md": "key", ... } } }
  asset_keys    jsonb not null,
  published_by  uuid,
  created_at    timestamptz not null default now()
);
create index if not exists publications_project_idx on publications(project_id, created_at desc);

-- Storage objects that were replaced or deleted but may still be referenced by an
-- older publication. Purged when a newer publication no longer needs them.
create table if not exists storage_garbage (
  key         text primary key,
  created_at  timestamptz not null default now()
);

create table if not exists admin_users (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique check (email = lower(email)),
  name            text not null default '',
  password_hash   text not null,
  created_at      timestamptz not null default now(),
  last_login_at   timestamptz
);

create table if not exists sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references admin_users(id) on delete cascade,
  token_hash   text not null unique,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  user_agent   text not null default ''
);
create index if not exists sessions_user_idx on sessions(user_id);

create table if not exists login_attempts (
  id          bigserial primary key,
  ip          text not null,
  email       text not null,
  success     boolean not null,
  created_at  timestamptz not null default now()
);
create index if not exists login_attempts_recent_idx on login_attempts(created_at desc);
