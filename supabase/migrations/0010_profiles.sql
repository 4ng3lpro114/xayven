-- XAYVEN — Fase 1: infraestructura de cuentas (public.profiles)
--
-- Extiende auth.users (gestionada por Supabase) con los datos propios de
-- XAYVEN: rol y, opcionalmente, el cliente comercial vinculado. Ver el
-- documento de arquitectura "Cuentas XAYVEN" para el diseño completo —
-- esta migración implementa únicamente F1 (infraestructura). No hay
-- vinculación todavía: client_id siempre queda null aquí — F3 se encarga
-- de vincularlo, reutilizando exactamente getClientByNormalizedEmail()
-- (src/lib/db/paymentsStore.ts), sin ninguna lógica de deduplicación
-- nueva. Tampoco hay policies de portal (proyectos/pagos/conversaciones)
-- todavía — eso es F4.
--
-- Puramente aditiva. No toca clients, contact_requests, projects,
-- payments, conversations, maintenance_requests ni ninguna tabla
-- existente. auth.users tiene 0 filas en este momento — no hay backfill
-- posible ni necesario.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,

  -- Nullable a propósito — F1 nunca vincula (ver arriba). ON DELETE SET
  -- NULL: mismo patrón exacto que conversations.client_id
  -- (0003_lead_to_client.sql) y contact_requests.client_id
  -- (0007_contact_requests.sql) — una cuenta es un registro que debe
  -- sobrevivir aunque el cliente al que apunta sea eliminado.
  client_id uuid null references public.clients(id) on delete set null,

  role text not null default 'client'
    check (role in ('admin', 'staff', 'client')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Reutiliza la función ya existente (0001_init.sql) — mismo patrón que
-- clients/projects/payments/promotions, ninguna función nueva.
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — mínima, solo lo que F1 necesita. Las policies completas del
-- portal (proyectos, pagos, conversaciones) son responsabilidad de F4.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

-- Un usuario autenticado solo puede leer su propio perfil. Ningún
-- usuario puede leer el perfil de otro.
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

-- Deliberadamente SIN policies de insert/update/delete para
-- authenticated/anon: hoy no existe ningún campo de perfil autoeditable
-- (no hay nombre/avatar todavía). Esto es lo que hace estructuralmente
-- imposible que un usuario modifique su propio `role` o `client_id` — no
-- porque una policy lo prohíba explícitamente, sino porque no existe
-- ningún camino de escritura para el rol `authenticated` en absoluto.
-- La única fila se crea vía el trigger de abajo (SECURITY DEFINER,
-- bypasea RLS por diseño); después de eso, solo el service role
-- (backend) puede escribir.

-- ---------------------------------------------------------------------------
-- Creación automática de profile al registrarse — mecanismo estándar de
-- Supabase Auth. SECURITY DEFINER: el rol siempre es 'client', nunca
-- depende de metadata enviada por el navegador, nunca permite que quien
-- se registra elija su propio rol ni escale privilegios.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, client_id)
  values (new.id, 'client', null);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
