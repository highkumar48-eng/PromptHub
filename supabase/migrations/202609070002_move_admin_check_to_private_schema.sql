-- Keep the security-definer role lookup out of PostgREST's public schema.
create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from public.app_roles where user_id = auth.uid() and role = 'admin');
$$;
grant usage on schema private to anon, authenticated;
grant execute on function private.is_admin() to anon, authenticated;
alter policy "admins can read roles" on public.app_roles using ((select private.is_admin()));
alter policy "public can read active creators" on public.creator_profiles using (is_active or (select auth.uid()) = id or (select private.is_admin()));
alter policy "admin manages creator profiles" on public.creator_profiles using ((select private.is_admin())) with check ((select private.is_admin()));
alter policy "public reads published prompts" on public.prompts using (status = 'published' or creator_id = (select auth.uid()) or (select private.is_admin()));
alter policy "admin manages prompts" on public.prompts using ((select private.is_admin())) with check ((select private.is_admin()));
alter policy "creator reads own monetization" on public.creator_monetization using (creator_id = (select auth.uid()) or (select private.is_admin()));
alter policy "admin manages monetization" on public.creator_monetization using ((select private.is_admin())) with check ((select private.is_admin()));
alter policy "creator reads own metrics" on public.creator_daily_metrics using (creator_id = (select auth.uid()) or (select private.is_admin()));
alter policy "admin manages metrics" on public.creator_daily_metrics using ((select private.is_admin())) with check ((select private.is_admin()));
alter policy "creator reads own ledger" on public.creator_monthly_ledger using (creator_id = (select auth.uid()) or (select private.is_admin()));
alter policy "admin manages ledger" on public.creator_monthly_ledger using ((select private.is_admin())) with check ((select private.is_admin()));
alter policy "admin reads payout methods" on public.creator_payout_methods using ((select private.is_admin()));
drop function public.is_admin();
