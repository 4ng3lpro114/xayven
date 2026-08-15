-- XAYVEN — Separar "cuenta XAYVEN" de "cliente comercial" en public.clients
--
-- Hasta hoy, la sola existencia de una fila en `clients` significaba
-- implícitamente "cliente comercial" — nunca hubo un campo explícito para
-- eso, porque hasta Fase 12 las únicas dos funciones que insertaban en esta
-- tabla eran convertConversationToClient() (Lead → Cliente) y
-- convertContactRequestToClient() (Solicitud → Cliente), ambas resultado de
-- una acción comercial explícita. Fase 12 reutilizó la misma primitiva
-- (createClientOrGetExisting) para vincular una cuenta XAYVEN recién
-- registrada, rompiendo esa invariante implícita sin que existiera ningún
-- campo que distinguiera el motivo real de creación.
--
-- `is_commercial` hace esa distinción explícita:
--   - true  = cliente comercial real (Lead → Cliente, Solicitud → Cliente,
--             creación directa de proyecto+cliente, o promovido manualmente
--             vía "Agregar cliente").
--   - false = únicamente tiene una cuenta XAYVEN vinculada
--             (profiles.client_id), nunca pasó por ningún flujo comercial.
--
-- `DEFAULT true` en este ADD COLUMN aplica automáticamente a TODAS las
-- filas existentes — correcto por construcción: toda fila creada hasta hoy
-- lo fue por uno de los dos flujos comerciales (o por la creación directa
-- de cliente+proyecto en /admin/projects/new), nunca por el registro de
-- una cuenta sola. No requiere backfill manual ni heurística.
--
-- Puramente aditiva. No toca profiles, conversations, contact_requests,
-- projects, payments ni ninguna policy existente.

alter table public.clients
  add column if not exists is_commercial boolean not null default true;
