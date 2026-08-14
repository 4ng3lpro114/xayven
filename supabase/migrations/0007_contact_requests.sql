-- XAYVEN — corrección del flujo "Crear mi proyecto" (POST /api/contact)
--
-- Hasta esta migración, /api/contact nunca persistía nada (ver el
-- comentario que tenía el propio route.ts) — un envío real quedaba
-- "recibido" desde la perspectiva del visitante (HTTP 200, frontend
-- mostraba éxito por res.ok) pero no dejaba ningún rastro si
-- CONTACT_EMAIL_TO no estaba configurado, como ocurrió en producción.
--
-- Tabla gemela de `maintenance_requests` (0001_init.sql) en forma y
-- disciplina — mismo patrón id/created_at/status — pero deliberadamente
-- NO la misma tabla: mantenimiento es un cliente que ya tiene un sitio
-- pidiendo soporte (`website` obligatorio, `need`/`priority`); contacto es
-- un prospecto sin sitio pidiendo uno nuevo (`project_type`/`budget`).
-- Mezclar ambos dominios en una tabla habría significado columnas
-- cruzadas nullable de dos formularios distintos.
--
-- Puramente aditiva — no toca ninguna fila existente de ninguna otra
-- tabla, no agrega columnas a tablas existentes.
--
-- `status` usa 'converted' (no 'resolved') porque una solicitud puede
-- terminar convirtiéndose en un `clients` real — ver `client_id` abajo y
-- src/lib/leads/contactRequestConversion.ts. 'converted' solo se alcanza
-- a través de ese flujo, nunca por un cambio de estado manual (ver la
-- UI: el botón de estado manual nunca ofrece 'converted' como opción) —
-- así "solicitud converted sin cliente real" es imposible tanto a nivel
-- de aplicación como de lo que este archivo modela.
--
-- Editada antes de aplicarse a producción — no existe ninguna fila real
-- con el valor 'resolved' que migrar.

create table if not exists public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  company text,
  project_type text not null,
  budget text not null,
  message text not null,
  status text not null default 'new' check (status in ('new', 'contacted', 'converted')),
  -- Mismo patrón que conversations.client_id (0003_lead_to_client.sql):
  -- ON DELETE SET NULL porque la solicitud es un registro histórico que
  -- debe sobrevivir aunque el cliente al que apunta sea eliminado —
  -- perder el vínculo es aceptable, perder la solicitud no lo es.
  --
  -- Deliberadamente NO se añade todavía ninguna columna de cuenta de
  -- usuario/autenticación aquí ni en `clients` — este FK simple
  -- (contact_requests.client_id -> clients.id) es exactamente la
  -- superficie que una futura fase de autenticación de clientes
  -- necesitaría para asociar una cuenta a un `clients.id` ya existente,
  -- sin que esta migración tenga que anticipar esa fase.
  client_id uuid references public.clients(id) on delete set null
);

create index if not exists contact_requests_created_at_idx
  on public.contact_requests (created_at desc);

create index if not exists contact_requests_client_id_idx
  on public.contact_requests (client_id);

alter table public.contact_requests enable row level security;
-- Misma postura que el resto de las tablas de este proyecto: solo el
-- service role (servidor) lee/escribe aquí, nunca el cliente directamente.
