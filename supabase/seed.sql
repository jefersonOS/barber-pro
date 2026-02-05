-- Seed inicial (execute no Supabase SQL Editor)
-- 1) Crie um usuário em Auth (Email/Password)
-- 2) Pegue o UUID do usuário (Auth -> Users)
-- 3) Cole o UUID no lugar de :user_id

-- Cria organização
insert into public.organizations (name)
values ('Barbearia Demo')
returning id;

-- Depois, use o org_id retornado acima e o user_id do Auth
-- Exemplo:
-- insert into public.org_users (org_id, user_id, role)
-- values ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'tenant_admin');
