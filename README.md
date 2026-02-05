
# Barber Pro (MVP)

SaaS multi-tenant para barbearias com:
- Atendimento e agendamento via WhatsApp (Evolution API v2 + Baileys) + agente de IA
- Painel web (Next.js App Router) para gestão (multi-tenant / multi-user)
- Pagamento de sinal via Stripe Checkout + confirmação por webhook

## Requisitos
- Node.js 20+
- Conta Supabase (Postgres + Auth)
- Evolution API v2 (self-hosted ou SaaS)
- Stripe
- OpenAI

## Setup local

1) Instale deps

```bash
npm i
```

2) Configure env

```bash
copy .env.example .env.local
```

Preencha as variáveis:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (uso restrito: webhooks/cron)
- `EVOLUTION_API_URL`
- `EVOLUTION_API_KEY`
- `EVOLUTION_WEBHOOK_PUBLIC_URL`
- `OPENAI_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_APP_URL`
- `INTERNAL_API_SECRET` (opcional, recomendado)
- `CRON_SECRET`

3) Rode o app

```bash
npm run dev
```

Abra `http://localhost:3000`.

## Aplicar SQL no Supabase

## Criar o projeto no Supabase (passo a passo)

1) Acesse o Dashboard do Supabase e crie um **New project**
2) Escolha nome, senha do Postgres e região
3) Depois de criado, pegue as chaves:
	- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
	- **anon public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
	- **service_role** → `SUPABASE_SERVICE_ROLE_KEY` (não expor no client)

## Aplicar SQL (schema + RLS)

1) No Supabase Dashboard, vá em **SQL Editor**
2) Cole e execute o arquivo de migration:

- [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql)

3) Crie um usuário no Supabase Auth (Email/Password)
4) Execute o seed inicial:

- [supabase/seed.sql](supabase/seed.sql)

5) Crie o vínculo do usuário com a org em `org_users` (o `user_id` você copia em Auth → Users)

Observação: com RLS ligado, inserts/seed normalmente são feitos via Service Role ou pelo SQL Editor.

## Stripe (webhook local)

1) Instale a Stripe CLI
2) Faça login:

```bash
stripe login
```

3) Encaminhe eventos para o webhook local:

```bash
stripe listen --forward-to http://localhost:3000/api/webhooks/stripe
```

4) Copie o `whsec_...` exibido e coloque em `STRIPE_WEBHOOK_SECRET`

### Stripe Checkout (criar sessão)

O backend expõe:
- `POST /api/payments/stripe/create-checkout`

Esse endpoint usa Service Role para validar/atualizar o agendamento e pode ser protegido (recomendado) definindo `INTERNAL_API_SECRET` e enviando o header:
- `x-internal-secret: <INTERNAL_API_SECRET>`

## Evolution API (webhook)

O endpoint esperado (MVP) é:
- `POST /api/webhooks/evolution`

Configure a URL pública no seu Evolution (por ex. via ngrok) e preencha:
- `EVOLUTION_WEBHOOK_PUBLIC_URL`

## Segurança (MVP)
- Todas as tabelas são multi-tenant com `org_id` e RLS habilitado.
- Chave `SUPABASE_SERVICE_ROLE_KEY` deve ser usada apenas em webhooks/cron.

## Cron (expirar holds)

Existe um endpoint para expirar automaticamente agendamentos em hold/pending_payment cujo `hold_expires_at` já passou:
- `POST /api/cron/expire-holds`

Ele exige o header:
- `x-cron-secret: <CRON_SECRET>`

## Roteiro de teste (fim a fim)

1) Entrar no painel: `/login`
2) Conectar WhatsApp (Settings → WhatsApp) e escanear QR
3) No WhatsApp, enviar: "Quero agendar corte amanhã"
4) Escolher serviço / profissional / horário sugerido
5) Gerar link de pagamento do sinal, pagar no Checkout
6) Receber confirmação do agendamento via WhatsApp
