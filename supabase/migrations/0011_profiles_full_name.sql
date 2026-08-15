-- XAYVEN — Cuentas: nombre completo en public.profiles
--
-- Añade el nombre completo a la cuenta del cliente, para poder
-- personalizar la experiencia ("Hola, Ángel" en vez de mostrar el email)
-- y, más adelante, usarlo al vincular la cuenta con un cliente comercial
-- (F3). No introduce username/alias — el identificador de autenticación
-- sigue siendo exclusivamente el email (auth.users), sin cambios.
--
-- Puramente aditiva sobre public.profiles. No toca clients,
-- contact_requests, projects, payments, conversations,
-- maintenance_requests ni ninguna otra tabla existente, ni sus policies.
--
-- Verificado antes de escribir esta migración: auth.users = 0 filas,
-- public.profiles = 0 filas (producción, aolqkbriokhicznklvjt) — por eso
-- full_name puede ser NOT NULL sin default ni backfill: no hay ninguna
-- fila existente que pudiera violar la restricción.

alter table public.profiles
  add column full_name text not null;

-- ---------------------------------------------------------------------------
-- Trigger: la fuente del nombre es exclusivamente el metadata que Supabase
-- Auth recibe durante signUp() (options.data.full_name en el registro, ver
-- /api/auth/register) — nunca un campo arbitrario controlado por el
-- navegador fuera de ese mecanismo. El nombre se recorta (trim) y se
-- valida aquí también, como segunda capa de defensa: SUPABASE_ANON_KEY es
-- pública, así que técnicamente cualquiera podría llamar a
-- supabase.auth.signUp() directamente sin pasar por nuestro
-- registerSchema — este trigger no puede asumir que el metadata ya viene
-- validado. Si el nombre resultante queda vacío, la fila no se crea (la
-- transacción de signUp falla) en vez de inventar un nombre de relleno.
--
-- role y client_id: exactamente igual que antes — siempre 'client' y null
-- respectivamente, nunca derivados de metadata del navegador.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_name text;
begin
  v_full_name := btrim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));

  if v_full_name = '' then
    raise exception 'full_name is required';
  end if;

  if length(v_full_name) > 100 then
    v_full_name := left(v_full_name, 100);
  end if;

  insert into public.profiles (id, full_name, role, client_id)
  values (new.id, v_full_name, 'client', null);
  return new;
end;
$$;
