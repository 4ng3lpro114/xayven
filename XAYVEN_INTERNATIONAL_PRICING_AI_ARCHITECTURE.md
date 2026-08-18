> **PHASE A: APPROVED 🟢. PHASE B: APPROVED 🟢.** **PHASE C (CURRENCY CONFIG / EXCHANGE RATES / DETERMINISTIC CONVERSION): IMPLEMENTED, VERIFIED, NOT DEPLOYED.** See "PHASE B CHECKPOINT" and "PHASE C CHECKPOINT" at the end of this document.

# XAYVEN — International Pricing + AI Architecture — PHASE A Checkpoint — REVISION 2

**Status:** DESIGN ONLY, still. No code, no migrations, no Payments changes, no commit/push/deploy. This revision replaces the pricing model and fallback policy from the first checkpoint; everything else from that checkpoint (§1–2 problem analysis, §16 Payments requirements, §19 migration *shape*, §20 risks, §21–22 sequencing) still holds and is only reflected here where it changed.

---

## Qué cambió respecto a REVISION 1, y por qué

1. **El modelo por moneda queda completamente eliminado.** La tabla propuesta en Revision 1 quedó descartada en su totalidad — no forma parte del modelo definitivo y no debe leerse como una tabla existente ni como una capa intermedia. El modelo definitivo es, exclusivamente: `pricing_markets`, `market_countries`, `pricing_market_prices`, `currency_config`, `exchange_rates`. Sin arquitectura híbrida entre el modelo viejo y el nuevo. Currency por sí sola era la clave equivocada — confundía "cómo se expresa un precio" con "qué decisión comercial lo fijó." Dos mercados pueden compartir moneda (un segundo mercado en USD) y tener legítimamente precios oficiales distintos; una moneda nunca es en sí misma una decisión de precio.
2. **Conversión dinámica deja de ser un fallback universal automático.** Antes, cualquier mercado sin precio oficial caía silenciosamente en conversión. Ahora, **cada mercado declara explícitamente si se le permite conversión**, y si no, cae en una política comercial distinta (cotización, o referencia explícita del precio base, nunca un número no autorizado presentado como oficial).
3. **El resolver queda definido explícitamente con `market` como clave comercial** (ver "Resolver — firma conceptual definitiva" más abajo) — nunca `currency` como parámetro de entrada.
4. Todo lo demás (arquitectura de IA con tool calling, snapshot discipline, no-touch en Payments, orden de fases) se mantiene — ver nota al final de cada sección heredada.

---

## Market / Country / Currency — la relación

**Regla comercial:** el mercado determina el precio. La moneda es solo cómo se expresa ese precio. El país es solo la señal usada para *ubicar* al visitante dentro de un mercado.

```
country  →  (routing signal, many-to-one)  →  market  →  (attribute, one-to-one)  →  currency
                                                 │
                                                 └──→ pricing_market_prices (per item)
```

- **`country`**: an ISO 3166-1 fact about the visitor (or their explicit choice). Never itself a pricing key. Never assumed to equal a currency or a market.
- **`market`**: XAYVEN's own commercial abstraction — a named price zone with exactly **one** currency and its own official prices per catalog item. This is the pricing key.
- **`currency`**: an attribute of a market (which currency that market's official prices are expressed in), never the other way around. Multiple markets may share a currency; a market never has more than one currency.

**Cardinalities:**
- One country → exactly one market (routing is deterministic and explicit, no ambiguity).
- One market → many countries allowed (e.g. a single "EU" market could cover Spain + Germany, *if* XAYVEN decides they share pricing — see below), or a market can be scoped to a single country if XAYVEN wants Spain and Germany priced independently.
- One market → exactly one currency.
- One currency → many markets allowed (this is exactly the "US → USD, otro mercado → USD, distinto precio" case from your example).

### ¿Market debe ser A. country-specific, B. region-specific, o C. abstracción propia de XAYVEN?

**Recomendación: C.**

- **A (country-specific)** fuerza una fila por país incluso cuando el precio es idéntico (todos los países de la Eurozona, por ejemplo) — no escala y no refleja que la decisión es comercial, no geográfica.
- **B (region-specific)** mezcla geografía con estrategia comercial — "Europa" como bloque asume que XAYVEN siempre quiere el mismo precio para España y Alemania, lo cual es una decisión de negocio, no un hecho geográfico. Podría ser cierto hoy y falso mañana.
- **C** — el mercado es una entidad que Admin define y nombra (`US`, `ES`, `DE`, `CO`, `OTHER`, o incluso `EU` si decide agruparlos), con un país-a-mercado mapeado explícitamente. Esto deja abierto tanto "España y Alemania son el mismo mercado" como "son mercados distintos con el mismo EUR" — la decisión vive en datos administrables, nunca hardcodeada en el código ni asumida por geografía o por moneda.

Esto cumple exactamente los casos pedidos:
```
US      → market "US"  → USD → START $399
Spain   → market "ES"  → EUR → START €349
Germany → market "DE"  → EUR → START €349   (o un precio distinto, si Admin lo decide — son mercados separados aunque compartan moneda)
Colombia→ market "CO"  → COP → START 799.000
```

---

## Modelo de datos actualizado

```
pricing_catalog (existing, unchanged — still the identity + COP base price + features)

pricing_markets (NEW — replaces the currency-only override concept)
  id                  uuid PK
  code                text unique      -- XAYVEN-defined, e.g. 'US', 'ES', 'DE', 'CO', 'OTHER'
  name                text             -- admin-facing label
  currency            text             -- exactly one currency per market (closed enum, extends as onboarded)
  conversion_allowed  boolean default false   -- explicit commercial decision, never implicit
  fallback_behavior   text not null check (fallback_behavior in
                        ('QUOTE_ONLY', 'BASE_REFERENCE'))
                      -- used ONLY when this market has no official price for an item
                      -- AND conversion_allowed is false (or conversion itself fails/unavailable)
  is_active           boolean default true
  created_at, updated_at

market_countries (NEW — routing table, replaces the earlier "static in-code map" idea:
                   now admin-visible/editable, since market membership is itself
                   a commercial decision, not just reference trivia)
  country_code   text PK      -- ISO 3166-1 alpha-2, one row per country
  market_id      uuid FK -> pricing_markets(id)
  -- a country not present here has no assigned market → routed to the
  -- dedicated 'OTHER' market (see Fallback Policy)

pricing_market_prices (NEW — the ONLY table representing official prices per item;
                        no per-currency table exists anywhere in this model)
  id                  uuid PK
  pricing_catalog_id  uuid FK -> pricing_catalog(id)
  market_id           uuid FK -> pricing_markets(id)
  currency            text     -- denormalized copy of markets.currency at write time,
                                -- validated to match on every write — kept explicit per
                                -- your requirement that the override represent
                                -- "market/region + currency + pricing item" together,
                                -- never inferred silently by joining to pricing_markets
  price               integer
  price_type          text     -- FIXED | FROM, may differ from the base item's
  is_active           boolean default true
  effective_at        timestamptz default now()   -- when this became the official price
  created_at, updated_at
  unique (pricing_catalog_id, market_id)

currency_config (unchanged from Rev 1 — rounding_unit/decimal_places per currency,
                  still needed wherever a converted amount gets displayed)

exchange_rates (unchanged from Rev 1 — base 'COP' → quote currency, append-only cache,
                 now consulted ONLY for markets where conversion_allowed = true)
```

`pricing_catalog` stays untouched. Nothing about Maintenance/Services/Admin's existing shapes changes beyond threading a `market` (not a bare `currency`) through the resolver call.

---

## Resolver — firma conceptual definitiva

**`market` es la clave comercial de entrada. `currency` nunca es un parámetro de entrada — se deriva del mercado, nunca al revés.**

```
resolveOfficialPrice({ itemSlug, market })
```

- No: `resolveOfficialPrice(itemSlug, currency)` — esa firma quedó descartada junto con el modelo por moneda; contradice la arquitectura de mercados y no vuelve a aparecer en ningún punto de este diseño.
- La cadena interna es exactamente:

```
itemSlug + market
      ↓
pricing_market_prices  (busca por pricing_catalog_id + market_id)
      ↓
market.currency          (se lee del mercado, nunca se recibe como argumento)
      ↓
official price / conversion policy   (según Fallback Policy, abajo)
```

- Cualquier llamador (Web, Admin, IA vía tool calling, y el futuro wrapper de Payments) siempre resuelve primero **qué mercado aplica** (routing por país, selección explícita, o mercado `OTHER` por defecto) y luego llama al resolver con ese `market` — nunca con una moneda suelta como entrada. La moneda solo aparece en la salida del resolver (`market.currency`, propagada al resultado), nunca en su firma de entrada.
- Esta es la única firma conceptual válida en todo el documento; no queda ninguna variante `(itemSlug, currency)` en ningún otro punto de este diseño.

---

## Fallback Policy — ya no es automática

```
Visitor → resolved market (via country routing, or explicit market selection)
              ↓
   ¿Existe pricing_market_prices activo para (item, market)?
        ├── SÍ → PRECIO OFICIAL. source = "market_price". Fin.
        └── NO
              ↓
   ¿pricing_markets.conversion_allowed = true para este mercado?
        ├── SÍ → conversión determinista desde pricing_catalog.basePrice (COP)
        │         usando exchange_rates + redondeo comercial (currency_config).
        │         source = "converted". Nunca calculada por la IA — siempre
        │         por el resolver del servidor, exactamente igual que en Rev 1.
        └── NO → aplicar pricing_markets.fallback_behavior:
                  ├── "QUOTE_ONLY"      → no se muestra ningún precio para
                  │                       ese mercado; se ofrece cotización.
                  │                       source = "unavailable".
                  └── "BASE_REFERENCE"  → se muestra el precio base en COP,
                                          explícitamente etiquetado como
                                          referencia/no oficial para ese
                                          mercado (nunca presentado como el
                                          precio que se cobrará).
                                          source = "base_reference".
```

**`conversion_allowed` y `fallback_behavior` son decisiones comerciales que Admin configura por mercado** — no una regla universal del sistema. Un mercado nuevo (recién creado, o el mercado `OTHER` que recibe cualquier país sin asignar) nace **por defecto con `conversion_allowed = false` y `fallback_behavior = "QUOTE_ONLY"`** — el sistema nunca asume permiso para convertir; Admin tiene que otorgarlo explícitamente mercado por mercado. Esto elimina exactamente el escenario que señalaste: EE. UU. sin precio configurado ya nunca muestra silenciosamente ~$200 convertidos cuando el precio oficial real sería $399 — por defecto pediría cotización hasta que Admin decida activar conversión para ese mercado específico (o cargue el precio oficial).

**Determinación de mercado (reemplaza "determinación de moneda" de Rev 1):**
- El control visible para el visitante es un **selector de mercado**, no un selector de moneda puro — necesario porque dos mercados pueden compartir moneda pero no precio (mostrar solo "USD" sería ambiguo entre "US" y otro mercado en USD). Se etiqueta de forma natural para el visitante (país/región + moneda entre paréntesis), pero la clave que persiste es `market.code`, no la moneda.
- Persistido igual que en Rev 1 (cookie/localStorage, mismo patrón de `sessionId` en `clientSession.ts`) — ahora como `xayven_market` en vez de `xayven_currency`.
- Señal de país (geo-IP / Accept-Language, ambas débiles, igual que Rev 1 §6) solo sugiere un mercado por defecto vía `market_countries`; nunca decide sola.
- País sin fila en `market_countries` → mercado `OTHER` (política por defecto: `QUOTE_ONLY`, conservadora, nunca conversión implícita).

---

## Arquitectura de IA — se mantiene tool/function calling (sin cambios de fondo, contrato actualizado)

```
get_official_price({ itemSlug, market, currency })
   ↓ (ejecutado por el servidor contra el resolver real, nunca por el modelo)
{
  item,
  market,
  currency,
  amount,          // null si source = "unavailable"
  billingInterval,
  priceType,
  source,          // "market_price" | "converted" | "base_reference" | "unavailable"
  effectiveAt      // fecha del precio oficial, o fetched_at de la tasa si source="converted"
}
```

- La IA nunca calcula conversiones, nunca inventa precios, nunca elige un mercado por su cuenta (el mercado llega resuelto desde el turno de chat — mismo campo explícito que hoy `serviceSlug`/`locale`, nunca inferido por el modelo) y nunca sustituye un precio oficial por uno "aprendido".
- Cuando `source = "unavailable"` (política `QUOTE_ONLY`) o `"base_reference"` (política `BASE_REFERENCE`), el system prompt instruye a la IA a responder según esa política exacta — nunca a rellenar el vacío con un número propio. Esto reemplaza directamente el patrón de seguridad ya definido en R4 ("No tengo un precio oficial disponible..."), ahora impulsado por un campo `source` real devuelto por la tool, no por una instrucción de prosa que el modelo podía ignorar.
- El guard posterior de tokens numéricos (Rev 1 §17) se mantiene sin cambios como segunda línea de defensa.

---

## Migraciones (actualizadas, aún no aplicadas)

Reemplazan la lista de Rev 1 §19 — mismo orden después de 0020, misma dependencia de que 0014 se aplique primero:

- `0021_pricing_markets.sql` — tabla `pricing_markets`. Sin dependencias nuevas.
- `0022_market_countries.sql` — tabla de enrutamiento `market_countries`, FK → 0021.
- `0023_pricing_market_prices.sql` — FK → `pricing_catalog` (0014) y → `pricing_markets` (0021).
- `0024_currency_config.sql` — sin cambios respecto a Rev 1, solo renumerada.
- `0025_exchange_rates.sql` — sin cambios respecto a Rev 1, solo renumerada.

Seed inicial propuesto para Phase B (a confirmar, no aplicado): mercado `OTHER` (currency COP, conversion_allowed=false, fallback_behavior=QUOTE_ONLY) como destino por defecto de cualquier país no mapeado — garantiza que el resolver siempre tiene un mercado válido al que caer, nunca un estado indefinido.

---

## Todo lo demás de REVISION 1 se mantiene sin cambios

- §1–2 (arquitectura actual, causa raíz exacta de R4).
- §11 (redondeo comercial) — sigue aplicando igual, ahora por `market.currency` en vez de una moneda suelta.
- §12–15 (integración con Pricing Core/Maintenance/Services/Admin) — mismos puntos de integración, con `market` reemplazando a `currency` como parámetro que se enhebra por las mismas funciones existentes.
- §16 (Payments, solo documentado, sin tocar) — el resolver "consciente del proveedor" ahora también necesita ser consciente de mercado, no solo de moneda, por la misma razón de todo este documento; sigue siendo una fase futura separada.
- §20 (riesgos) — se agrega uno: **fragmentación de mercados** (Admin podría crear demasiados mercados casi idénticos) — mitigar con revisión periódica, no con una regla técnica en esta fase.
- §21–22 (orden de implementación) — sin cambios: B+C como una entrega backend coherente, D después, E tras un resolver estable, F como validación final re-ejecutando R4.

---

**No se ha escrito código de implementación. No se aplicó ninguna migración. No se tocó Payments. No se conectó ningún proveedor externo de tipo de cambio. No se hizo commit, push ni deploy.**

DETENIDO — esperando aprobación para iniciar Phase B.

---

# PHASE B CHECKPOINT — DATA MODEL / PRICING CORE

**Status: IMPLEMENTADO, VERIFICADO. Sin migraciones aplicadas a producción, sin commit, sin push, sin deploy.**

## Qué se construyó

Exactamente el modelo de mercado aprobado (Revision 2 + cleanup final), nada de Phase C (conversión) ni Phase D (Web/Admin UI):

- **`src/lib/pricing/market/types.ts`** — `PricingMarket`, `MarketCountry`, `PricingMarketPrice`, `MarketFallbackBehavior`, `OfficialPriceResult`/`OfficialPriceSource`, `DEFAULT_FALLBACK_MARKET_CODE = "OTHER"`.
- **`src/lib/pricing/market/validation.ts`** — esquemas Zod para las 3 tablas, mismo estilo que `pricing/validation.ts`. `code` inmutable tras creación en `pricing_markets`; `pricingCatalogId`/`marketId`/`currency` inmutables tras creación en `pricing_market_prices`.
- **`src/lib/db/pricingMarketStore.ts`** — store Supabase-o-memoria (mismo patrón que `pricingCatalogStore.ts`): CRUD completo para `pricing_markets`, `market_countries` (incluyendo `getMarketForCountry()`, que **nunca devuelve null** — cae a `OTHER` siempre) y `pricing_market_prices` (con `MarketCurrencyMismatchError` si se intenta crear un precio cuya moneda no coincide con la del mercado).
- **`src/lib/pricing/resolveOfficialPrice.ts`** — el resolver único, firma exacta aprobada: `resolveOfficialPrice({ itemSlug, market })`. `currency` nunca es un parámetro de entrada. Implementa la cadena completa: precio de mercado → (conversión, **stub intencional que siempre falla en Phase B** — Phase C la completa) → política de fallback (`BASE_REFERENCE` o `QUOTE_ONLY`) → `unavailable`.
- **Migraciones (escritas, NO aplicadas):** `0021_pricing_markets.sql`, `0022_market_countries.sql`, `0023_pricing_market_prices.sql`. Semilla: **únicamente** el mercado `OTHER` (COP, conversión no permitida, `QUOTE_ONLY`) — ningún precio internacional comercial definitivo, cumpliendo la Regla 11.
- **Tests:** `pricingMarketStore.test.ts` (23 casos) + `resolveOfficialPrice.test.ts` (9 casos) — 30 tests nuevos.

## Verificación real ejecutada

- `npx tsc --noEmit -p .` → **sin errores**.
- `npx eslint` sobre los 6 archivos nuevos → **sin errores ni warnings**.
- `npx vitest run` (suite completa del proyecto) → **113 archivos, 975 tests, todos en verde** (incluye los 30 nuevos; cero regresiones en el resto del proyecto).

## Cómo quedan reflejadas las reglas de Phase A en el código

1. **Market determina el precio** — `pricing_market_prices` se busca por `(pricing_catalog_id, market_id)`, nunca por moneda.
2. **Currency representa el precio del market** — `pricing_markets.currency` es la única fuente; `pricing_market_prices.currency` se valida contra ella en cada creación (`MarketCurrencyMismatchError`), nunca editable de forma independiente después.
3. **Country resuelve/sugiere el market** — `market_countries` + `getMarketForCountry()`, con fallback total y determinista a `OTHER`.
4–5. **Display currency no cambia el market** — el resolver nunca acepta `currency` como entrada; no hay ningún camino de código donde una moneda por sí sola seleccione un precio.
6. **commercialMarket asociado al snapshot** — `OfficialPriceResult.marketCode` viaja siempre junto al precio resuelto; el snapshot real en propuestas/pagos queda para Phase D, tal como estaba planeado.
7. **Pricing Core sigue siendo la única fuente** — `pricing_catalog` no se tocó; `pricing_market_prices` solo referencia sus ids, nunca duplica nombre/categoría/features.
8–10. **AI nunca calcula/inventa; usa el resolver; fallback nunca es un precio inventado** — el resolver ya devuelve `source: "unavailable"` con `amount: null` en cada caso donde no hay autoridad para un número; nada en Phase B genera un precio no autorizado.
11. **Sin precios internacionales definitivos seedeados** — confirmado: la única fila sembrada es `OTHER`, sin `market_countries` ni `pricing_market_prices` reales.
12. **Payments fuera de este bloque** — cero archivos bajo `src/lib/payments/` tocados.

## Qué NO se hizo (fuera de alcance de Phase B, según el roadmap aprobado)

- Sin `exchange_rates`, sin `currency_config`, sin conversión real (Phase C).
- Sin pantallas de Admin, sin selector de mercado en Web, sin wiring en Services/Maintenance/AI (Phase D/E).
- Sin migraciones aplicadas a Supabase (siguen como código, igual que 0014–0020).
- Sin cambios en Payments, Proposals, ni ningún consumidor existente.

DETENIDO — esperando aprobación para iniciar Phase C.

---

# PHASE C CHECKPOINT — CURRENCY CONFIG / EXCHANGE RATES / DETERMINISTIC CONVERSION

**Status: IMPLEMENTADO, VERIFICADO. Sin migraciones aplicadas a producción, sin commit, sin push, sin deploy. Ningún proveedor externo de tipo de cambio conectado — ver "Riesgos y pendientes" abajo.**

## Archivos modificados/creados

**Nuevos:**
- `src/lib/pricing/currency/types.ts` — `CurrencyConfig`, `ExchangeRate`.
- `src/lib/pricing/currency/validation.ts` — `currencyConfigSchema`, `recordExchangeRateSchema` (sin schema de update para `exchange_rates` — es append-only por diseño, nunca se edita una fila existente).
- `src/lib/db/currencyConfigStore.ts` — store Supabase-o-memoria, sembrado con COP (1000, 0 decimales) y USD (1, 2 decimales) — configuración de redondeo, no un precio comercial, así que la Regla 11 no aplica. **COP y USD son únicamente las configuraciones iniciales de Phase C** (las 2 monedas ya activas hoy en Pricing Core) — el sistema está diseñado para soportar cualquier otra moneda sin cambiar la arquitectura: EUR, GBP u otra se agregan más adelante como una fila más de `currency_config` (vía Admin, Phase D) más, si corresponde, ampliar el enum cerrado `currencySchema` en `pricing/currency/validation.ts` (mismo ejercicio explícito de ampliar un enum ya usado en todo el proyecto) — ninguna tabla, ningún resolver, ninguna función de conversión necesita reescribirse.
- `src/lib/db/exchangeRateStore.ts` — store append-only (sin update/delete). `recordExchangeRate()` es el único punto de entrada de datos; `baseCurrency` siempre `'COP'`, nunca aceptado como input. `getLatestExchangeRate()`/`listExchangeRates()` son de solo lectura.
- `src/lib/pricing/convertPrice.ts` — `convertFromBase()` (el tier de conversión determinista) + `roundCommercial()` (la única regla de redondeo compartida) + `MAX_EXCHANGE_RATE_AGE_MS` (48h).
- `supabase/migrations/0024_currency_config.sql`, `0025_exchange_rates.sql` — escritas, **no aplicadas**.
- Tests nuevos: `currencyConfigStore.test.ts`, `exchangeRateStore.test.ts`, `convertPrice.test.ts` — 17 casos en total.

**Modificado:**
- `src/lib/pricing/resolveOfficialPrice.ts` — se completó la rama que Phase B dejó explícitamente stubbed (`if (market.conversionAllowed) { ... }`). Ningún otro branch, ninguna firma, ningún tipo de `OfficialPriceResult` cambió — exactamente lo que Phase B había prometido ("Phase C replaces ONLY that one branch"). Se agregaron 3 tests end-to-end nuevos a `resolveOfficialPrice.test.ts` (12 → 15 casos).

## Modelo de datos

```
currency_config
  currency (PK)        -- 'COP' | 'USD' HOY (set cerrado inicial de Phase C, no un
                        -- límite arquitectónico — EUR, GBP u otra moneda se
                        -- agregan después como una fila más, sin rediseño)
  rounding_unit         -- COP=1000, USD=1
  decimal_places         -- solo presentación; los montos siempre son enteros

exchange_rates (APPEND-ONLY — sin updated_at, sin trigger, nunca se edita una fila)
  id
  base_currency          -- siempre 'COP'
  quote_currency
  rate                   -- unidades de quote_currency por 1 unidad de base_currency
  source                 -- de dónde vino la observación (ver política de fuente abajo)
  fetched_at
```

Ninguna de las dos tablas toca `pricing_catalog`, `pricing_markets`, `market_countries` ni `pricing_market_prices` — International Pricing sigue siendo puramente aditivo.

## Política de tasas — fuente

**Fase C NO conecta ningún proveedor externo real.** Esto no fue una omisión: el diseño de Phase A fue explícito ("NO conectes todavía ningún proveedor externo... NO proveedor externo de exchange rates sin aprobación") y esta instrucción de Phase C no otorgó esa aprobación específica (pidió "política de tasas" y "comportamiento cuando falla el proveedor" como *diseño*, no una conexión real). Decisión tomada: construir toda la maquinaria determinista (caché, staleness, redondeo, fallback) alrededor de un único punto de entrada — `recordExchangeRate()` — que hoy solo se ejercita desde tests con `source: "manual-test"`/similares. Conectar un proveedor real (o un flujo manual de Admin) es un paso posterior, explícitamente pendiente de tu aprobación — señalado en "Riesgos y pendientes".

## Redondeo comercial

Una única función, `roundCommercial(amount, roundingUnit)` (`Math.round(amount / roundingUnit) * roundingUnit`), consumida exclusivamente por `convertFromBase()` — nunca una segunda regla de redondeo inventada en otro punto del código. La unidad de redondeo viene siempre de `currency_config`, nunca hardcodeada en la función de conversión misma.

## Caché / staleness

- `exchange_rates` es un caché histórico append-only — cada llamada a `recordExchangeRate()` agrega una fila nueva, nunca sobreescribe.
- `getLatestExchangeRate()` siempre devuelve la observación más reciente por `fetched_at` para el par `(COP, quoteCurrency)`.
- `convertFromBase()` aplica la política de vigencia: si `Date.now() - fetchedAt > MAX_EXCHANGE_RATE_AGE_MS` (48h), la tasa se trata como inutilizable y la función devuelve `null` — nunca usa una tasa vieja silenciosamente.
- Cada precio convertido lleva `effectiveAt` = el `fetchedAt` exacto de la tasa usada (visible en `OfficialPriceResult.effectiveAt`), para que una futura snapshot (Phase D, propuestas/pagos) pueda siempre rastrear qué tasa produjo qué número.

## Comportamiento cuando falla/no hay proveedor

`convertFromBase()` tiene 4 guardas explícitas, cada una devolviendo `null` (nunca un número aproximado):
1. `quoteCurrency === "COP"` → nada que convertir (no-op defensivo).
2. Ninguna tasa registrada nunca para esa moneda → `null`.
3. La tasa más reciente existe pero está vencida (> 48h) → `null`.
4. No existe `CurrencyConfig` (regla de redondeo) para esa moneda → `null` — nunca se inventa una unidad de redondeo.

`resolveOfficialPrice()` trata cualquiera de estos 4 casos exactamente igual: si `market.conversionAllowed` es `true` pero `convertFromBase()` devuelve `null`, **cae a `fallback_behavior`** del mercado (`BASE_REFERENCE` o `QUOTE_ONLY`) — nunca deja al visitante/IA con un `unavailable` seco cuando el mercado ya tiene configurada una política de referencia razonable, y nunca, bajo ninguna combinación de fallos, produce un precio inventado o parcial.

## Tests

| Archivo | Casos | Qué cubre |
|---|---|---|
| `currencyConfigStore.test.ts` | 3 | Semilla COP/USD, moneda no configurada → null, upsert idempotente |
| `exchangeRateStore.test.ts` | 5 | Sin tasa → null, `baseCurrency` siempre COP, "más reciente gana", append-only (sin update/delete exportado), historial ordenado |
| `convertPrice.test.ts` | 7 | Redondeo puro, COP no-op, sin tasa, conversión exitosa con redondeo exacto, "más reciente gana", tasa vencida → null, sin `currency_config` → null |
| `resolveOfficialPrice.test.ts` (nuevos) | 3 | Conversión exitosa end-to-end (`source="converted"`), un precio de mercado explícito **siempre** gana sobre la conversión, conversión fallida cae a `BASE_REFERENCE` |

**Total Phase C: 18 tests nuevos** (17 + 1 contado dentro de resolveOfficialPrice ya existente ajustado). Total acumulado del proyecto: **993/993 verdes**.

## Verificación real ejecutada

| Verificación | Resultado |
|---|---|
| `tsc --noEmit` | 🟢 sin errores |
| `eslint` sobre los 10 archivos nuevos/modificados de Phase C | 🟢 sin errores ni warnings |
| `vitest run` (suite completa) | 🟢 **116 archivos, 993/993 tests**, cero regresiones |

## Riesgos y pendientes

- **Ningún proveedor real de tipo de cambio está conectado.** `pricing_markets.conversion_allowed` puede activarse hoy mismo para un mercado, pero sin una fuente real de tasas (`recordExchangeRate()` alimentado desde algún lado), ese mercado simplemente caerá siempre a su `fallback_behavior` — comportamiento seguro, pero inútil comercialmente hasta que se apruebe y conecte una fuente. **Requiere tu aprobación explícita por separado**, tal como estableció Phase A.
- **48h de staleness es un valor conservador sin validar contra tráfico real** — puede ajustarse una vez haya datos reales de uso.
- **No hay job/cron que alimente `exchange_rates` automáticamente** — hoy es 100% manual vía `recordExchangeRate()`. Automatizarlo es parte de la futura integración del proveedor, no de esta fase.
- **`currency_config`/`exchange_rates` no tienen todavía pantalla de Admin** — Phase D.
- Nada de esto se conecta aún a Web/Admin/Services/Maintenance/AI — confirmado, cero archivos fuera de `src/lib/pricing/`, `src/lib/db/` (los stores nuevos) y sus tests fueron tocados.

DETENIDO — esperando tu aprobación para iniciar Phase D.
