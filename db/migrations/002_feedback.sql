-- Pilot feedback: one response per user per activity, given after approval.
-- Free-text answers are the respondent's own words; nothing is generated.
-- No voice recordings are stored.

create table activity_feedback (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  worked_well text check (char_length(worked_well) <= 2000),
  difficult text check (char_length(difficult) <= 2000),
  report_corrections text not null check (report_corrections in ('none', 'minor', 'major')),
  manual_effort text not null check (manual_effort in ('little', 'some', 'most')),
  would_use_again text not null check (would_use_again in ('yes', 'maybe', 'no')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (activity_id, user_id)
);
create index activity_feedback_created_idx on activity_feedback (created_at desc);
