-- College Operations Copilot — initial schema.
-- Every factual field value carries provenance (source document, page, method,
-- confidence, status). Nothing here stores inferred values by default.

create extension if not exists pgcrypto;

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null,
  role text not null check (role in ('faculty', 'admin')),
  password_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index users_email_lower_idx on users (lower(email));

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_user_idx on sessions (user_id);

-- Generic fixed-window rate limiting (login attempts, uploads).
create table rate_limit_events (
  id bigserial primary key,
  bucket text not null,
  key text not null,
  created_at timestamptz not null default now()
);
create index rate_limit_events_lookup_idx on rate_limit_events (bucket, key, created_at);

-- Report templates are configuration, not code. definition is validated by
-- src/lib/templates/schema.ts before it is stored.
create table templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  version integer not null,
  name text not null,
  description text,
  derived_from text,
  definition jsonb not null,
  is_active boolean not null default true,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (slug, version)
);

create table activities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete restrict,
  template_id uuid not null references templates(id) on delete restrict,
  status text not null default 'DRAFT' check (status in
    ('DRAFT', 'PROCESSING', 'REVIEW_REQUIRED', 'READY_FOR_APPROVAL', 'APPROVED', 'ARCHIVED')),
  display_title text,
  fields_updated_at timestamptz not null default now(),
  reconciliation_ack jsonb,
  approved_by uuid references users(id) on delete set null,
  approved_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index activities_owner_idx on activities (owner_id, updated_at desc);

create table sources (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  kind text not null check (kind in
    ('poster', 'notice', 'activity_report', 'detailed_report', 'attendance', 'photo', 'supporting')),
  filename text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes integer not null check (size_bytes > 0),
  sha256 text not null,
  page_count integer,
  caption text,
  source_info text,
  extraction_status text not null default 'pending' check (extraction_status in
    ('pending', 'processing', 'done', 'failed', 'skipped')),
  extraction_error text,
  extraction_updated_at timestamptz,
  uploaded_by uuid references users(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  unique (activity_id, sha256)
);
create index sources_activity_idx on sources (activity_id);

-- Original bytes are kept separately so list queries never load file data.
-- Source files are never modified after upload.
create table source_blobs (
  source_id uuid primary key references sources(id) on delete cascade,
  data bytea not null
);

create table source_extractions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id) on delete cascade,
  page integer not null check (page >= 1),
  method text not null check (method in ('pdf_text', 'ocr', 'none')),
  engine text not null,
  text text not null default '',
  confidence numeric(5, 2),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (source_id, page)
);

-- Every value found in a source for a field. Conflicts are computed from these.
create table field_candidates (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  field_key text not null,
  value text not null,
  normalized text not null,
  source_id uuid not null references sources(id) on delete cascade,
  page integer not null,
  confidence numeric(4, 3) not null,
  method text not null check (method in ('deterministic_parser', 'llm')),
  rule text not null,
  snippet text,
  created_at timestamptz not null default now()
);
create index field_candidates_activity_idx on field_candidates (activity_id, field_key);

-- The resolved value per field, with provenance and edit history columns.
create table activity_fields (
  activity_id uuid not null references activities(id) on delete cascade,
  field_key text not null,
  value text,
  status text not null check (status in ('extracted', 'user_entered', 'inferred', 'missing', 'conflicting')),
  source_id uuid references sources(id) on delete set null,
  source_page integer,
  confidence numeric(4, 3),
  method text,
  candidate_id uuid references field_candidates(id) on delete set null,
  original_value text,
  edited_by uuid references users(id) on delete set null,
  edited_at timestamptz,
  note text,
  updated_at timestamptz not null default now(),
  primary key (activity_id, field_key)
);

create table attendance_records (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  source_id uuid references sources(id) on delete set null,
  page integer,
  serial_no integer,
  student_name text not null,
  gender text not null default 'unspecified' check (gender in ('male', 'female', 'unspecified')),
  gender_raw text,
  signature_present boolean,
  method text not null check (method in ('ocr', 'manual', 'csv')),
  confidence numeric(4, 3),
  issues text[] not null default '{}',
  verified boolean not null default false,
  verified_by uuid references users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index attendance_activity_idx on attendance_records (activity_id, serial_no);

create table generated_reports (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  report_type text not null check (report_type in ('activity_report', 'detailed_report', 'attendance_summary')),
  version integer not null,
  content jsonb not null,
  generator text not null,
  generated_by uuid references users(id) on delete set null,
  generated_at timestamptz not null default now(),
  unique (activity_id, report_type, version)
);

create table audit_logs (
  id bigserial primary key,
  actor_id uuid references users(id) on delete set null,
  activity_id uuid references activities(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_activity_idx on audit_logs (activity_id, created_at desc);
create index audit_logs_created_idx on audit_logs (created_at desc);
