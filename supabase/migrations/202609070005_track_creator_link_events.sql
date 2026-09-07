-- This RPC is deliberately callable only by the server-side tracking function.
-- Public browsers never receive a privileged database key and cannot call it directly.
create or replace function public.track_creator_event(
  p_creator_id uuid,
  p_visitor_hash text,
  p_event text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  is_new_visitor boolean := false;
begin
  if p_event not in ('visit', 'copy') or char_length(p_visitor_hash) <> 64 then
    raise exception 'Invalid tracking event';
  end if;

  if p_event = 'visit' then
    insert into private.creator_daily_visitors (creator_id, metric_date, visitor_hash)
    values (p_creator_id, current_date, p_visitor_hash)
    on conflict do nothing;
    get diagnostics is_new_visitor = row_count;

    if is_new_visitor then
      insert into public.creator_daily_metrics (creator_id, metric_date, unique_visitors, prompt_copies)
      values (p_creator_id, current_date, 1, 0)
      on conflict (creator_id, metric_date) do update
        set unique_visitors = public.creator_daily_metrics.unique_visitors + 1;
    end if;
  else
    insert into public.creator_daily_metrics (creator_id, metric_date, unique_visitors, prompt_copies)
    values (p_creator_id, current_date, 0, 1)
    on conflict (creator_id, metric_date) do update
      set prompt_copies = public.creator_daily_metrics.prompt_copies + 1;
  end if;

  return jsonb_build_object('tracked', true, 'unique_visit', is_new_visitor);
end;
$$;

revoke all on function public.track_creator_event(uuid, text, text) from public, anon, authenticated;
grant execute on function public.track_creator_event(uuid, text, text) to service_role;
