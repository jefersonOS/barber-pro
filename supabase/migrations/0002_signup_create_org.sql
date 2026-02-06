-- 0002_signup_create_org.sql
-- Allows an authenticated user to create their first org safely (without service role)

begin;

create or replace function public.create_org_for_current_user(
	org_name text,
	owner_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
	_uid uuid;
	_existing_org uuid;
	_org_id uuid;
begin
	_uid := auth.uid();
	if _uid is null then
		raise exception 'not_authenticated';
	end if;

	select ou.org_id
	into _existing_org
	from public.org_users ou
	where ou.user_id = _uid
	order by ou.created_at asc
	limit 1;

	if _existing_org is not null then
		return _existing_org;
	end if;

	insert into public.organizations (name)
	values (org_name)
	returning id into _org_id;

	insert into public.org_users (org_id, user_id, role)
	values (_org_id, _uid, 'tenant_admin');

	if owner_name is not null and length(trim(owner_name)) > 0 then
		insert into public.professionals (org_id, user_id, name)
		values (_org_id, _uid, owner_name);
	end if;

	return _org_id;
end;
$$;

revoke all on function public.create_org_for_current_user(text, text) from public;
grant execute on function public.create_org_for_current_user(text, text) to authenticated;

commit;
