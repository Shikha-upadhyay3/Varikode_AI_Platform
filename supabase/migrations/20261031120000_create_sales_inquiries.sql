-- Stores "Contact us" requests from the pricing page.
create table if not exists public.sales_inquiries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  user_id uuid not null default auth.uid(),
  contact_name text not null,
  contact_email text not null,
  contact_phone text,
  expected_messages text,
  message text,
  created_at timestamptz not null default now()
);

alter table public.sales_inquiries enable row level security;

-- A signed-in user can send a request for themselves and see their own requests.
create policy "users insert own sales inquiries"
  on public.sales_inquiries for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "users read own sales inquiries"
  on public.sales_inquiries for select
  to authenticated
  using (user_id = auth.uid());

-- Varikode reads all requests from the Supabase dashboard (Table Editor).
