-- XAYVEN — Solicitud → Cliente: agrega `company` a `clients`
--
-- Puramente aditiva y nullable — clientes existentes quedan con
-- company = null y siguen funcionando exactamente igual (no hay ningún
-- formulario de edición de cliente en todo el proyecto hoy, así que no hay
-- ningún flujo que dependa de esta columna existir).
--
-- Necesaria para que src/lib/leads/contactRequestConversion.ts pueda
-- propagar contact_requests.company -> clients.company al convertir una
-- solicitud en cliente, sin perder ese dato (el formulario "Crear mi
-- proyecto" ya lo recopila; hasta ahora `clients` no tenía dónde
-- guardarlo).

alter table public.clients add column if not exists company text;
