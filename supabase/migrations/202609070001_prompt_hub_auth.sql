-- PromptHub secure first production schema for Supabase.
-- The first administrator is assigned after that person signs up:
-- insert into public.app_roles (user_id, role) values ('<auth-user-uuid>', 'admin')

create type public.app_role as enum ('creator', 'admin');
create type public.prompt_status as enum ('draft', 'published', 'archived');
create type public.ledger_status as enum ('calculated', 'approved', 'paid', 'on_hold');

create table public.app_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'creator',
  assigned_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from public.app_roles where user_id = auth.uid() and role = 'admin');
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

create table public.creator_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9][a-z0-9-]{2,29}$'),
  display_name text not null check (char_length(display_name) between 1 and 80),
  bio text not null default '' check (char_length(bio) <= 240),
  avatar_path text, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.prompts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creator_profiles(id) on delete cascade,
  keyword text not null check (char_length(keyword) between 1 and 80),
  title text not null check (char_length(title) between 1 and 140),
  prompt text not null check (char_length(prompt) between 1 and 12000),
  preview_path text, status public.prompt_status not null default 'draft',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (creator_id, keyword)
);
create index prompts_public_lookup_idx on public.prompts (creator_id, keyword) where status = 'published';

create table public.creator_monetization (
  creator_id uuid primary key references public.creator_profiles(id) on delete cascade,
  eligibility_threshold integer not null default 50000 check (eligibility_threshold > 0),
  revenue_share_percent numeric(5,2) not null default 50.00 check (revenue_share_percent between 0 and 100),
  status text not null default 'tracking' check (status in ('tracking', 'scheduled', 'monetized', 'paused')),
  monetized_from date, updated_at timestamptz not null default now()
);

create table public.creator_daily_metrics (
  creator_id uuid not null references public.creator_profiles(id) on delete cascade,
  metric_date date not null, unique_visitors integer not null default 0 check (unique_visitors >= 0),
  prompt_copies integer not null default 0 check (prompt_copies >= 0), primary key (creator_id, metric_date)
);

create table public.creator_monthly_ledger (
  id uuid primary key default gen_random_uuid(), creator_id uuid not null references public.creator_profiles(id) on delete restrict,
  period_start date not null, period_end date not null, visitor_count integer not null default 0 check (visitor_count >= 0),
  gross_revenue_paise bigint not null default 0 check (gross_revenue_paise >= 0), invalid_traffic_paise bigint not null default 0 check (invalid_traffic_paise >= 0),
  taxes_paise bigint not null default 0 check (taxes_paise >= 0), direct_payout_cost_paise bigint not null default 0 check (direct_payout_cost_paise >= 0),
  net_distributable_paise bigint generated always as (greatest(0, gross_revenue_paise - invalid_traffic_paise - taxes_paise - direct_payout_cost_paise)) stored,
  creator_share_paise bigint generated always as (round(greatest(0, gross_revenue_paise - invalid_traffic_paise - taxes_paise - direct_payout_cost_paise) * 0.50)::bigint) stored,
  platform_share_paise bigint generated always as (greatest(0, gross_revenue_paise - invalid_traffic_paise - taxes_paise - direct_payout_cost_paise) - round(greatest(0, gross_revenue_paise - invalid_traffic_paise - taxes_paise - direct_payout_cost_paise) * 0.50)::bigint) stored,
  status public.ledger_status not null default 'calculated', approved_at timestamptz, paid_at timestamptz, payment_reference text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (period_end >= period_start), unique (creator_id, period_start, period_end)
);

create table public.creator_payout_methods (
  creator_id uuid primary key references public.creator_profiles(id) on delete cascade,
  upi_id text check (char_length(upi_id) <= 200), account_holder_name text check (char_length(account_holder_name) <= 120), updated_at timestamptz not null default now()
);

create schema private;
create table private.creator_daily_visitors (
  creator_id uuid not null references public.creator_profiles(id) on delete cascade, metric_date date not null,
  visitor_hash text not null, created_at timestamptz not null default now(), primary key (creator_id, metric_date, visitor_hash)
);

create trigger creator_profiles_updated_at before update on public.creator_profiles for each row execute procedure public.set_updated_at();
create trigger prompts_updated_at before update on public.prompts for each row execute procedure public.set_updated_at();
create trigger monetization_updated_at before update on public.creator_monetization for each row execute procedure public.set_updated_at();
create trigger ledger_updated_at before update on public.creator_monthly_ledger for each row execute procedure public.set_updated_at();
create trigger payout_methods_updated_at before update on public.creator_payout_methods for each row execute procedure public.set_updated_at();

alter table public.app_roles enable row level security;
alter table public.creator_profiles enable row level security;
alter table public.prompts enable row level security;
alter table public.creator_monetization enable row level security;
alter table public.creator_daily_metrics enable row level security;
alter table public.creator_monthly_ledger enable row level security;
alter table public.creator_payout_methods enable row level security;
alter table private.creator_daily_visitors enable row level security;

create policy "admins can read roles" on public.app_roles for select using ((select public.is_admin()));
create policy "public can read active creators" on public.creator_profiles for select using (is_active or (select auth.uid()) = id or (select public.is_admin()));
create policy "creator creates own profile" on public.creator_profiles for insert with check ((select auth.uid()) = id);
create policy "creator updates own profile" on public.creator_profiles for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "admin manages creator profiles" on public.creator_profiles for all using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "public reads published prompts" on public.prompts for select using (status = 'published' or creator_id = (select auth.uid()) or (select public.is_admin()));
create policy "creator manages own prompts" on public.prompts for all using (creator_id = (select auth.uid())) with check (creator_id = (select auth.uid()));
create policy "admin manages prompts" on public.prompts for all using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "creator reads own monetization" on public.creator_monetization for select using (creator_id = (select auth.uid()) or (select public.is_admin()));
create policy "admin manages monetization" on public.creator_monetization for all using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "creator reads own metrics" on public.creator_daily_metrics for select using (creator_id = (select auth.uid()) or (select public.is_admin()));
create policy "admin manages metrics" on public.creator_daily_metrics for all using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "creator reads own ledger" on public.creator_monthly_ledger for select using (creator_id = (select auth.uid()) or (select public.is_admin()));
create policy "admin manages ledger" on public.creator_monthly_ledger for all using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "creator manages own payout method" on public.creator_payout_methods for all using (creator_id = (select auth.uid())) with check (creator_id = (select auth.uid()));
create policy "admin reads payout methods" on public.creator_payout_methods for select using ((select public.is_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('prompt-previews', 'prompt-previews', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy "public reads prompt previews" on storage.objects for select using (bucket_id = 'prompt-previews');
create policy "creator uploads own prompt previews" on storage.objects for insert to authenticated with check (bucket_id = 'prompt-previews' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "creator updates own prompt previews" on storage.objects for update to authenticated using (bucket_id = 'prompt-previews' and owner_id = (select auth.uid()::text)) with check (bucket_id = 'prompt-previews' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "creator deletes own prompt previews" on storage.objects for delete to authenticated using (bucket_id = 'prompt-previews' and owner_id = (select auth.uid()::text));


