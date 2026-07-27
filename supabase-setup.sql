-- Rode isso uma vez no seu projeto Supabase: Dashboard → SQL Editor → New query → cole e clique em "Run".
-- Cria a tabela onde o servidor guarda uma cópia de segurança de pedidos, clientes e configurações.

create table if not exists shogatsu_kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

-- Não precisa mexer em "Row Level Security": o servidor usa a service_role key, que sempre
-- tem acesso total, independente de RLS estar ligado ou não na tabela.
