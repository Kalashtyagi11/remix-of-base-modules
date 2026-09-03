-- AMND-01 — every product version must have an amendment policy row.
-- Without one, computeAreaEditability() locks PARTICIPANTS, BENEFIT_FACTS,
-- DOCUMENTS, PAYMENT, CALC_INPUTS and DECISION unconditionally, and no screen
-- can create the missing row. The only previous insert was a one-time backfill
-- on 2026-06-06, so every version created since is permanently locked.
--
-- Additive only: a trigger plus a backfill. No column, type or constraint is
-- changed; the unique key on product_version_id already exists.

create or replace function public.bn_seed_amendment_policy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.bn_product_amendment_policy (product_version_id, created_by)
  values (new.id, coalesce(new.entered_by, 'SYSTEM'))
  on conflict (product_version_id) do nothing;
  return new;
end
$$;

drop trigger if exists bn_product_version_seed_amendment_policy on public.bn_product_version;

create trigger bn_product_version_seed_amendment_policy
  after insert on public.bn_product_version
  for each row execute function public.bn_seed_amendment_policy();

-- Backfill every version created since the June migration.
insert into public.bn_product_amendment_policy (product_version_id, created_by)
select pv.id, 'BACKFILL'
  from public.bn_product_version pv
 where not exists (
   select 1
     from public.bn_product_amendment_policy p
    where p.product_version_id = pv.id
 )
on conflict (product_version_id) do nothing;