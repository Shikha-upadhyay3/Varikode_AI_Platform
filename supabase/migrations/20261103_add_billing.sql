-- 1) Add billing columns to the organizations table (our "workspace")
alter table organizations
  add column if not exists plan text default 'free',
  add column if not exists message_limit int default 50,
  add column if not exists subscription_id text,
  add column if not exists subscription_status text default 'none',
  add column if not exists renewal_date timestamptz,
  add column if not exists reminder_sent_for timestamptz;

-- 2) Notifications table (shown on the client dashboard)
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references organizations(id) on delete cascade,
  type text,
  title text,
  message text,
  is_read boolean default false,
  created_at timestamptz default now()
);

-- 3) Index for fast unread notification lookup
create index if not exists idx_notifications_workspace_unread
  on notifications (workspace_id, is_read, created_at desc);

-- 4) Index for the daily renewal reminder cron job
create index if not exists idx_org_renewal
  on organizations (subscription_status, renewal_date);