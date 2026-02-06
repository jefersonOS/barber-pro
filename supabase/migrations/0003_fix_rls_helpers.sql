-- 0003_fix_rls_helpers.sql
-- Fix RLS helper recursion by making membership helpers SECURITY DEFINER.

begin;

create or replace function public.current_user_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
	select ou.org_id
	from public.org_users ou
	where ou.user_id = auth.uid();
$$;

create or replace function public.is_org_member(_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
	select exists(
		select 1 from public.org_users ou
		where ou.org_id = _org_id and ou.user_id = auth.uid()
	);
$$;

create or replace function public.is_tenant_admin(_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
	select exists(
		select 1 from public.org_users ou
		where ou.org_id = _org_id
		and ou.user_id = auth.uid()
		and ou.role in ('owner','tenant_admin')
	);
$$;

create or replace function public.is_professional_in_org(_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
	select exists(
		select 1 from public.org_users ou
		where ou.org_id = _org_id
		and ou.user_id = auth.uid()
		and ou.role in ('professional')
	);
$$;

revoke all on function public.current_user_org_ids() from public;
revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.is_tenant_admin(uuid) from public;
revoke all on function public.is_professional_in_org(uuid) from public;

grant execute on function public.current_user_org_ids() to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_tenant_admin(uuid) to authenticated;
grant execute on function public.is_professional_in_org(uuid) to authenticated;

commit;
