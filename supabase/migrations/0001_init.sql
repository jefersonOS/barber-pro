-- 0001_init.sql
-- Barber Pro (multi-tenant) schema + RLS

begin;

-- Required for gen_random_uuid()
create extension if not exists pgcrypto;

-- Organizations
create table if not exists public.organizations (
	id uuid primary key default gen_random_uuid(),
	name text not null,
	whatsapp_instance_id text unique null,
	stripe_account_id text null,
	created_at timestamptz not null default now()
);

-- Org users (membership + role)
create table if not exists public.org_users (
	id uuid primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations(id) on delete cascade,
	user_id uuid not null,
	role text not null check (role in ('owner','tenant_admin','professional')),
	created_at timestamptz not null default now()
);

-- Professionals
create table if not exists public.professionals (
	id uuid primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations(id) on delete cascade,
	user_id uuid null,
	name text not null,
	phone text null
);

-- Units
create table if not exists public.units (
	id uuid primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations(id) on delete cascade,
	name text not null,
	address text null
);

-- Services
create table if not exists public.services (
	id uuid primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations(id) on delete cascade,
	name text not null,
	price_cents int not null,
	duration_min int not null,
	deposit_percent int not null check (deposit_percent >= 0 and deposit_percent <= 100)
);

-- Appointments
create table if not exists public.appointments (
	id uuid primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations(id) on delete cascade,
	unit_id uuid null references public.units(id) on delete set null,
	professional_id uuid not null references public.professionals(id) on delete restrict,
	service_id uuid not null references public.services(id) on delete restrict,
	customer_phone text not null,
	customer_name text null,
	starts_at timestamptz not null,
	ends_at timestamptz not null,
	status text not null check (status in ('draft','hold','pending_payment','confirmed','canceled','expired','completed','no_show')),
	hold_expires_at timestamptz null,
	deposit_amount_cents int null,
	created_at timestamptz not null default now()
);

-- Appointment payments
create table if not exists public.appointment_payments (
	id uuid primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations(id) on delete cascade,
	appointment_id uuid not null references public.appointments(id) on delete cascade,
	provider text not null default 'stripe',
	status text not null check (status in ('pending','paid','failed','refunded')),
	stripe_checkout_session_id text null,
	stripe_payment_intent_id text null,
	stripe_event_id text unique null,
	amount_cents int not null,
	currency text not null default 'brl',
	created_at timestamptz not null default now()
);

-- Conversations (per org + phone)
create table if not exists public.conversations (
	id uuid primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations(id) on delete cascade,
	phone text not null,
	created_at timestamptz not null default now(),
	unique (org_id, phone)
);

-- Inbound messages (idempotency by provider_message_id)
create table if not exists public.inbound_messages (
	id uuid primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations(id) on delete cascade,
	conversation_id uuid not null references public.conversations(id) on delete cascade,
	provider_message_id text not null unique,
	phone text not null,
	text text not null,
	created_at timestamptz not null default now()
);

-- Conversation logs
create table if not exists public.conversation_logs (
	id uuid primary key default gen_random_uuid(),
	org_id uuid not null references public.organizations(id) on delete cascade,
	conversation_id uuid not null references public.conversations(id) on delete cascade,
	role text not null check (role in ('user','assistant','system')),
	content text not null,
	created_at timestamptz not null default now()
);

-- Grants (Supabase needs explicit grants in many setups)
grant usage on schema public to authenticated;

grant select, insert, update, delete on table public.organizations to authenticated;
grant select, insert, update, delete on table public.org_users to authenticated;
grant select, insert, update, delete on table public.professionals to authenticated;
grant select, insert, update, delete on table public.units to authenticated;
grant select, insert, update, delete on table public.services to authenticated;
grant select, insert, update, delete on table public.appointments to authenticated;
grant select, insert, update, delete on table public.appointment_payments to authenticated;
grant select, insert, update, delete on table public.conversations to authenticated;
grant select, insert, update, delete on table public.inbound_messages to authenticated;
grant select, insert, update, delete on table public.conversation_logs to authenticated;

-- Indexes (org_id everywhere)
create index if not exists organizations_created_at_idx on public.organizations (created_at);

create index if not exists org_users_org_id_idx on public.org_users (org_id);
create index if not exists org_users_user_id_idx on public.org_users (user_id);

create index if not exists professionals_org_id_idx on public.professionals (org_id);
create index if not exists units_org_id_idx on public.units (org_id);
create index if not exists services_org_id_idx on public.services (org_id);

create index if not exists appointments_org_id_idx on public.appointments (org_id);
create index if not exists appointments_org_starts_at_idx on public.appointments (org_id, starts_at);
create index if not exists appointments_professional_id_idx on public.appointments (professional_id);

create index if not exists appointment_payments_org_id_idx on public.appointment_payments (org_id);
create index if not exists appointment_payments_stripe_event_id_idx on public.appointment_payments (stripe_event_id);

create index if not exists conversations_org_id_idx on public.conversations (org_id);
create index if not exists inbound_messages_org_id_idx on public.inbound_messages (org_id);
create index if not exists inbound_messages_provider_message_id_idx on public.inbound_messages (provider_message_id);
create index if not exists conversation_logs_org_id_idx on public.conversation_logs (org_id);

-- RLS helpers
create or replace function public.current_user_org_ids()
returns setof uuid
language sql
stable
as $$
	select ou.org_id
	from public.org_users ou
	where ou.user_id = auth.uid();
$$;

create or replace function public.is_org_member(_org_id uuid)
returns boolean
language sql
stable
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
as $$
	select exists(
		select 1 from public.org_users ou
		where ou.org_id = _org_id and ou.user_id = auth.uid() and ou.role in ('tenant_admin')
	);
$$;

create or replace function public.is_professional_in_org(_org_id uuid)
returns boolean
language sql
stable
as $$
	select exists(
		select 1 from public.org_users ou
		where ou.org_id = _org_id and ou.user_id = auth.uid() and ou.role in ('professional')
	);
$$;

-- Transactional hold creation (anti-overbooking)
-- NOTE: Intended to be called via Service Role (webhook/AI), not by the browser client.
create or replace function public.create_hold_appointment(
	_org_id uuid,
	_phone text,
	_service_id uuid,
	_professional_id uuid,
	_unit_id uuid,
	_starts_at timestamptz,
	_customer_name text default null
)
returns public.appointments
language plpgsql
security definer
as $$
declare
	svc record;
	_end_at timestamptz;
	_deposit int;
	_hold_expires timestamptz;
	_appt public.appointments;
begin
	select price_cents, duration_min, deposit_percent
	into svc
	from public.services
	where id = _service_id and org_id = _org_id;

	if not found then
		raise exception 'service_not_found';
	end if;

	_end_at := _starts_at + make_interval(mins => svc.duration_min);
	_deposit := floor((svc.price_cents * svc.deposit_percent) / 100.0);
	_hold_expires := now() + interval '10 minutes';

	-- Block if overlaps any active hold (not expired) or confirmed
	if exists (
		select 1
		from public.appointments a
		where a.org_id = _org_id
		and a.professional_id = _professional_id
		and (
			a.status = 'confirmed'
			or (a.status = 'hold' and a.hold_expires_at is not null and a.hold_expires_at > now())
			or (a.status = 'pending_payment' and a.hold_expires_at is not null and a.hold_expires_at > now())
		)
		and a.starts_at < _end_at
		and a.ends_at > _starts_at
	) then
		raise exception 'slot_unavailable';
	end if;

	insert into public.appointments (
		org_id,
		unit_id,
		professional_id,
		service_id,
		customer_phone,
		customer_name,
		starts_at,
		ends_at,
		status,
		hold_expires_at,
		deposit_amount_cents
	)
	values (
		_org_id,
		nullif(_unit_id, '00000000-0000-0000-0000-000000000000'::uuid),
		_professional_id,
		_service_id,
		_phone,
		_customer_name,
		_starts_at,
		_end_at,
		'hold',
		_hold_expires,
		_deposit
	)
	returning * into _appt;

	return _appt;
end;
$$;

revoke all on function public.create_hold_appointment(uuid, text, uuid, uuid, uuid, timestamptz, text) from public;
grant execute on function public.create_hold_appointment(uuid, text, uuid, uuid, uuid, timestamptz, text) to authenticated;

grant execute on function public.current_user_org_ids() to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_tenant_admin(uuid) to authenticated;
grant execute on function public.is_professional_in_org(uuid) to authenticated;

-- Enable RLS
alter table public.organizations enable row level security;
alter table public.org_users enable row level security;
alter table public.professionals enable row level security;
alter table public.units enable row level security;
alter table public.services enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_payments enable row level security;
alter table public.conversations enable row level security;
alter table public.inbound_messages enable row level security;
alter table public.conversation_logs enable row level security;

-- Organizations policies
drop policy if exists organizations_select on public.organizations;
create policy organizations_select
on public.organizations
for select
to authenticated
using (public.is_org_member(id));

drop policy if exists organizations_update on public.organizations;
create policy organizations_update
on public.organizations
for update
to authenticated
using (public.is_tenant_admin(id))
with check (public.is_tenant_admin(id));

-- org_users policies
drop policy if exists org_users_select on public.org_users;
create policy org_users_select
on public.org_users
for select
to authenticated
using (public.is_org_member(org_id));

drop policy if exists org_users_write on public.org_users;
create policy org_users_write
on public.org_users
for all
to authenticated
using (public.is_tenant_admin(org_id))
with check (public.is_tenant_admin(org_id));

-- professionals policies
drop policy if exists professionals_select on public.professionals;
create policy professionals_select
on public.professionals
for select
to authenticated
using (public.is_org_member(org_id));

drop policy if exists professionals_write on public.professionals;
create policy professionals_write
on public.professionals
for all
to authenticated
using (public.is_tenant_admin(org_id))
with check (public.is_tenant_admin(org_id));

-- units policies
drop policy if exists units_select on public.units;
create policy units_select
on public.units
for select
to authenticated
using (public.is_org_member(org_id));

drop policy if exists units_write on public.units;
create policy units_write
on public.units
for all
to authenticated
using (public.is_tenant_admin(org_id))
with check (public.is_tenant_admin(org_id));

-- services policies
drop policy if exists services_select on public.services;
create policy services_select
on public.services
for select
to authenticated
using (public.is_org_member(org_id));

drop policy if exists services_write on public.services;
create policy services_write
on public.services
for all
to authenticated
using (public.is_tenant_admin(org_id))
with check (public.is_tenant_admin(org_id));

-- appointments policies
-- tenant_admin: can see all appointments in org
drop policy if exists appointments_select_admin on public.appointments;
create policy appointments_select_admin
on public.appointments
for select
to authenticated
using (public.is_tenant_admin(org_id));

drop policy if exists appointments_insert_admin on public.appointments;
create policy appointments_insert_admin
on public.appointments
for insert
to authenticated
with check (public.is_tenant_admin(org_id));

drop policy if exists appointments_update_admin on public.appointments;
create policy appointments_update_admin
on public.appointments
for update
to authenticated
using (public.is_tenant_admin(org_id))
with check (public.is_tenant_admin(org_id));

drop policy if exists appointments_delete_admin on public.appointments;
create policy appointments_delete_admin
on public.appointments
for delete
to authenticated
using (public.is_tenant_admin(org_id));

-- Professional-specific appointment access (read-only)
-- A professional can see appointments where the linked professional.user_id = auth.uid()
drop policy if exists appointments_select_professional on public.appointments;
create policy appointments_select_professional
on public.appointments
for select
to authenticated
using (
	public.is_professional_in_org(org_id)
	and exists(
		select 1 from public.professionals p
		where p.id = appointments.professional_id
		and p.org_id = appointments.org_id
		and p.user_id = auth.uid()
	)
);

-- appointment_payments policies (admin-only)
drop policy if exists appointment_payments_select on public.appointment_payments;
create policy appointment_payments_select
on public.appointment_payments
for select
to authenticated
using (public.is_tenant_admin(org_id));

drop policy if exists appointment_payments_write on public.appointment_payments;
create policy appointment_payments_write
on public.appointment_payments
for all
to authenticated
using (public.is_tenant_admin(org_id))
with check (public.is_tenant_admin(org_id));

-- conversations policies (admin-only; webhook/service-role bypasses RLS)
drop policy if exists conversations_select on public.conversations;
create policy conversations_select
on public.conversations
for select
to authenticated
using (public.is_tenant_admin(org_id));

drop policy if exists conversations_write on public.conversations;
create policy conversations_write
on public.conversations
for all
to authenticated
using (public.is_tenant_admin(org_id))
with check (public.is_tenant_admin(org_id));

-- inbound_messages policies (admin-only)
drop policy if exists inbound_messages_select on public.inbound_messages;
create policy inbound_messages_select
on public.inbound_messages
for select
to authenticated
using (public.is_tenant_admin(org_id));

drop policy if exists inbound_messages_write on public.inbound_messages;
create policy inbound_messages_write
on public.inbound_messages
for all
to authenticated
using (public.is_tenant_admin(org_id))
with check (public.is_tenant_admin(org_id));

-- conversation_logs policies (admin-only)
drop policy if exists conversation_logs_select on public.conversation_logs;
create policy conversation_logs_select
on public.conversation_logs
for select
to authenticated
using (public.is_tenant_admin(org_id));

drop policy if exists conversation_logs_write on public.conversation_logs;
create policy conversation_logs_write
on public.conversation_logs
for all
to authenticated
using (public.is_tenant_admin(org_id))
with check (public.is_tenant_admin(org_id));

commit;
