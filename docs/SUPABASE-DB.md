# Supabase DB + Auth

O portal multiempresas pode usar o **Supabase como PostgreSQL e como provedor de autenticação**.
O stack da aplicação continua sendo:

- `Next.js App Router`
- `Prisma`
- `Supabase Auth`

## Variáveis

Defina no ambiente:

```env
DATABASE_URL="postgresql://postgres.xxx:[PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.xxx:[PASSWORD]@db.xxx.supabase.co:5432/postgres"
NEXT_PUBLIC_APP_URL="https://seu-dominio.com"
NEXT_PUBLIC_SUPABASE_URL="https://xxxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="sua_anon_key"
SUPABASE_SERVICE_ROLE_KEY="sua_service_role_key"
MASTER_ADMIN_EMAIL="admin@datageodigital.com.br"
MASTER_ADMIN_PASSWORD="uma_senha_forte"
JWT_SECRET="fallback_temporario_ate_remover_o_login_legado"
```

## Regras

- `DATABASE_URL`: use o **pooler** do Supabase.
- `DIRECT_URL`: use a conexão **direta** para migrations do Prisma.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: usada pelo login, refresh de sessão e recuperação de senha.
- `SUPABASE_SERVICE_ROLE_KEY`: usada em rotas administrativas e no auto cadastro para criar o utilizador inicial da empresa.
- `JWT_SECRET`: ainda existe apenas como compatibilidade enquanto houver sessões antigas.

## Comandos

```powershell
npx prisma generate
npx prisma migrate deploy
npm run db:seed
```

## Escopo

Esta configuração cobre:

- login por email e senha
- cadastro de cliente com criação automática da empresa
- recuperação e redefinição de senha
- logout
- cadastro de clientes por admin
- slug automático
- portal em `/cliente/[slug]`
- isolamento por `Company` / `OrgMembership`
- compartilhamento autenticado de relatórios
