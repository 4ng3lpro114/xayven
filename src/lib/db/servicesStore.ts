import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/db/supabase";
import { getGlobalMap } from "@/lib/db/memoryStore";
import type { CreateServiceInput, Service, ServiceContent, UpdateServiceInput } from "@/lib/services/types";

/**
 * Services persistence — same shape as promotionStore.ts/
 * pricingCatalogStore.ts: Supabase when SUPABASE_URL/
 * SUPABASE_SERVICE_ROLE_KEY are set, an in-memory fallback otherwise.
 *
 * Like pricing_catalog (and unlike clients/projects/promotions, which
 * start genuinely empty), this table is pre-seeded — services are
 * reference/editorial content XAYVEN authors, not something a visitor
 * creates. Running locally without Supabase configured still shows the
 * real 5 services, not an empty catalog. Kept in sync with the migration
 * manually — if the two ever drift, this comment is the pointer to fix
 * it (same convention already established by pricingCatalogStore.ts).
 *
 * Full CRUD exists from this phase on (unlike pricing_catalog, which is
 * still read-only) because Services IS meant to be admin-manageable from
 * this arc — see the Phase 1 commercial-domain decision. Never a raw
 * `{...current, ...patch}` spread — explicit field whitelist in both the
 * Supabase and in-memory branches, same discipline as
 * promotionStore.ts's updatePromotion(). Never falls back to memory on a
 * REAL Supabase error — only `!supabase` (not configured at all) is a
 * legitimate fallback.
 */

const memoryStore = getGlobalMap<string, Service>("services");

function nowIso(): string {
  return new Date().toISOString();
}

interface ServiceRow {
  id: string;
  created_at: string;
  updated_at: string;
  slug: string;
  display_order: number;
  is_published: boolean;
  related_package_slugs: string[];
  content_es: ServiceContent;
  content_en: ServiceContent;
}

function rowToService(row: ServiceRow): Service {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    slug: row.slug,
    displayOrder: row.display_order,
    isPublished: row.is_published,
    relatedPackageSlugs: row.related_package_slugs,
    content: { es: row.content_es, en: row.content_en },
  };
}

// ---------------------------------------------------------------------------
// Seed content — the 5 real XAYVEN services, in both locales. Mirrors the
// migration's own seed (see 0017_services.sql). `relatedPackageSlugs`
// references pricing_catalog by slug only — SEO/Automation deliberately
// have none today (quote-based, no closed package exists for them yet;
// see the master prompt's own package↔service mapping guidance, §11).
// ---------------------------------------------------------------------------

const SEED_SERVICES: readonly Omit<Service, "id" | "createdAt" | "updatedAt">[] = [
  {
    slug: "web-development",
    displayOrder: 0,
    isPublished: true,
    relatedPackageSlugs: ["start", "professional", "business"],
    content: {
      es: {
        heading: "Diseño y desarrollo web",
        tagline: "Sitios web construidos desde cero, con estrategia y código propio — no plantillas genéricas.",
        definition:
          "Diseño y desarrollo web es la construcción de tu sitio completo: la parte visual (diseño de marca, jerarquía, tipografía) y la parte técnica (código, rendimiento, SEO) trabajando como una sola pieza, no como dos entregas separadas.",
        problem: [
          "Tu web actual no representa la calidad real de tu negocio, o simplemente no tienes una.",
          "Usaste una plantilla genérica y se nota — no transmite confianza ni te diferencia de la competencia.",
          "El sitio existe pero no está pensado para convertir visitas en clientes: no hay un camino claro hacia el contacto.",
          "Editar el sitio o hacerle cambios depende de terceros que ya no responden.",
        ],
        solution:
          "XAYVEN no entrega una plantilla con tu logo encima. Diseñamos la estructura de información, la jerarquía visual y cada sección pensando en tu negocio específico, y luego construimos el sitio con código propio, sin builders genéricos de por medio. El resultado es un sitio que se ve hecho a medida porque lo fue, y que técnicamente puede crecer contigo en vez de quedarse limitado a lo que permite el plan de una plantilla.",
        includes: [
          "Diseño personalizado (no plantillas)",
          "Diseño responsive para móvil, tablet y escritorio",
          "Dominio, SSL y configuración técnica",
          "SEO técnico básico desde el primer despliegue",
          "Integración con WhatsApp",
          "Formularios de contacto",
          "Analytics para medir visitas",
          "Panel administrativo y gestión de clientes/proyectos en los paquetes que lo incluyen",
          "Código propio, sin dependencia de plantillas de terceros",
        ],
        forWhom: {
          idealIf: [
            "Negocios que necesitan una web nueva o una renovación completa.",
            "Marcas que quieren diferenciarse visualmente de la competencia.",
            "Negocios que necesitan que la web ayude activamente a conseguir clientes, no solo existir.",
          ],
          notIdealIf: [
            "Ya tienes un sitio funcionando bien y solo necesitas mantenimiento — revisa Mantenimiento.",
            "Necesitas vender productos online de forma directa — revisa Tiendas online.",
          ],
        },
        useCases: [
          "Un negocio local reemplaza una landing hecha en un builder genérico por un sitio propio, con diseño de marca y formulario conectado a WhatsApp.",
          "Una empresa de servicios profesionales necesita un sitio con secciones para cada línea de negocio y un panel para gestionar sus propios proyectos y clientes.",
        ],
        faq: [
          {
            question: "¿Cuánto cuesta un sitio web con XAYVEN?",
            answer:
              "Depende del paquete: START desde $799.000 COP, PROFESSIONAL desde $1.499.000 COP y BUSINESS desde $2.499.000 COP, todos pago único. La diferencia entre ellos es el número de secciones y las funcionalidades incluidas.",
          },
          {
            question: "¿Cuánto tiempo toma el desarrollo?",
            answer:
              "Depende del alcance y de qué tan rápido llegue el contenido/material del negocio. XAYVEN comparte un cronograma real después de entender el proyecto, no una fecha genérica antes de eso.",
          },
          {
            question: "¿El sitio queda en un builder como Wix o WordPress?",
            answer:
              "No. XAYVEN construye con código propio, no sobre builders de terceros. Esto da más control sobre rendimiento, diseño y crecimiento futuro del sitio.",
          },
          {
            question: "¿Incluye hosting y dominio?",
            answer: "Sí, la configuración técnica de dominio, SSL y hosting está incluida en todos los paquetes de desarrollo web.",
          },
          {
            question: "¿Puedo pedir cambios después de que el sitio esté publicado?",
            answer:
              "Sí, a través de los planes de mantenimiento (Essential, Growth o Care+), pensados exactamente para eso: cambios, actualizaciones y soporte continuo después del lanzamiento.",
          },
          {
            question: "¿Qué diferencia hay entre START, PROFESSIONAL y BUSINESS?",
            answer:
              "Principalmente el número de secciones/páginas y las funcionalidades incluidas: BUSINESS agrega panel administrativo, gestión de clientes y proyectos, XAYVEN AI y funcionalidades comerciales que START no incluye.",
          },
          {
            question: "¿El sitio incluye SEO?",
            answer:
              "Todos los paquetes incluyen SEO técnico básico desde el despliegue. Si necesitas una estrategia de SEO más profunda, revisa el servicio de SEO por separado.",
          },
          {
            question: "¿Necesito tener el contenido (textos, fotos) listo antes de empezar?",
            answer: "Ayuda mucho tenerlo, pero no es obligatorio desde el día uno — XAYVEN puede guiar qué información se necesita en cada etapa.",
          },
        ],
      },
      en: {
        heading: "Web design and development",
        tagline: "Websites built from scratch, with strategy and our own code — never generic templates.",
        definition:
          "Web design and development is building your entire site as one piece: the visual side (brand design, hierarchy, typography) and the technical side (code, performance, SEO) working together, not delivered as two separate things.",
        problem: [
          "Your current site doesn't represent the real quality of your business — or you don't have one.",
          "You used a generic template and it shows — it doesn't build trust or set you apart from competitors.",
          "The site exists but isn't built to convert visits into clients: there's no clear path to contact you.",
          "Editing the site or making changes depends on a third party who's no longer responsive.",
        ],
        solution:
          "XAYVEN doesn't hand you a template with your logo on it. We design the information structure, visual hierarchy and every section around your specific business, then build the site with our own code, no generic builders involved. The result looks custom-built because it is, and can technically grow with you instead of staying capped at whatever a template's plan allows.",
        includes: [
          "Custom design (no templates)",
          "Responsive design for mobile, tablet and desktop",
          "Domain, SSL and technical setup",
          "Basic technical SEO from the first deploy",
          "WhatsApp integration",
          "Contact forms",
          "Analytics to measure traffic",
          "Admin panel and client/project management on packages that include it",
          "Code we own, no dependency on third-party templates",
        ],
        forWhom: {
          idealIf: [
            "Businesses that need a new website or a full redesign.",
            "Brands that want to stand out visually from competitors.",
            "Businesses that need their website to actively help win clients, not just exist.",
          ],
          notIdealIf: [
            "Your site already works well and you just need upkeep — see Maintenance.",
            "You need to sell products directly online — see E-commerce.",
          ],
        },
        useCases: [
          "A local business replaces a landing page built on a generic builder with its own site, brand design and a contact form wired to WhatsApp.",
          "A professional services firm needs a site with a section per business line and a panel to manage its own projects and clients.",
        ],
        faq: [
          {
            question: "How much does a website with XAYVEN cost?",
            answer:
              "Depends on the package: START from $799,000 COP, PROFESSIONAL from $1,499,000 COP and BUSINESS from $2,499,000 COP, all one-time payments. The difference is the number of sections and the included features.",
          },
          {
            question: "How long does development take?",
            answer:
              "It depends on scope and how quickly the business's content/material arrives. XAYVEN shares a real timeline after understanding the project, never a generic date before that.",
          },
          {
            question: "Does the site end up on a builder like Wix or WordPress?",
            answer: "No. XAYVEN builds with our own code, never on top of third-party builders — more control over performance, design and future growth.",
          },
          {
            question: "Does it include hosting and domain?",
            answer: "Yes, domain, SSL and hosting setup is included in every web development package.",
          },
          {
            question: "Can I request changes after the site is live?",
            answer:
              "Yes, through the maintenance plans (Essential, Growth or Care+) — built exactly for that: changes, updates and ongoing support after launch.",
          },
          {
            question: "What's the difference between START, PROFESSIONAL and BUSINESS?",
            answer:
              "Mainly the number of sections/pages and included features: BUSINESS adds an admin panel, client/project management, XAYVEN AI and commercial features that START doesn't include.",
          },
          {
            question: "Does the site include SEO?",
            answer: "Every package includes basic technical SEO from deployment. For a deeper SEO strategy, see the SEO service on its own.",
          },
          {
            question: "Do I need my content (copy, photos) ready before starting?",
            answer: "It helps a lot, but it's not required on day one — XAYVEN can guide what's needed at each stage.",
          },
        ],
      },
    },
  },
  {
    slug: "ecommerce",
    displayOrder: 1,
    isPublished: true,
    relatedPackageSlugs: ["ecommerce"],
    content: {
      es: {
        heading: "Tiendas online",
        tagline: "Vende directamente por internet, sin depender solo de redes sociales.",
        definition:
          "Una tienda online con XAYVEN es un sitio completo con catálogo de productos, carrito, checkout y pagos integrados, pensado para que un visitante pueda comprar sin salir del sitio ni escribirte por WhatsApp para cada duda.",
        problem: [
          "Hoy vendes solo por Instagram/WhatsApp y pierdes pedidos por mensajes que se acumulan o se pierden.",
          "No tienes forma de mostrar tu catálogo completo de forma ordenada.",
          "Cobrar es manual: transferencias, capturas de pantalla, confirmaciones por chat.",
          "No hay forma de saber qué productos realmente se venden más sin revisar conversación por conversación.",
        ],
        solution:
          "XAYVEN construye la tienda como un sistema, no como una vitrina: catálogo con categorías y variantes, carrito, checkout con pagos online integrados, gestión de pedidos y panel administrativo para que controles el inventario y el estado de cada pedido sin depender de un desarrollador para cada cambio.",
        includes: [
          "Catálogo de productos con categorías y variantes",
          "Carrito y checkout",
          "Pagos online integrados",
          "Gestión de pedidos y estados de pedido",
          "Gestión de clientes",
          "Promociones y descuentos",
          "Analytics avanzado",
          "Panel administrativo",
          "SEO e integración con WhatsApp",
        ],
        forWhom: {
          idealIf: [
            "Negocios que venden productos físicos o digitales y quieren cobrar directamente en el sitio.",
            "Marcas que ya venden por redes sociales y necesitan un catálogo y checkout ordenados.",
          ],
          notIdealIf: ["Solo necesitas mostrar información de la empresa sin vender directamente — revisa Diseño y desarrollo web."],
        },
        useCases: [
          "Tartalia Repostería: catálogo de productos, pedidos y reservas en un sitio propio, con base SEO técnica completa (proyecto real, ver /work).",
        ],
        faq: [
          {
            question: "¿Cuánto cuesta una tienda online?",
            answer:
              "Desde $3.499.000 COP, pago único. El precio final depende de la cantidad de productos, variantes, inventario e integraciones que necesite tu tienda.",
          },
          {
            question: "¿Por qué el precio es 'desde' y no un valor fijo?",
            answer:
              "Porque el alcance real varía mucho entre negocios: cantidad de productos, envíos, facturación, checkout personalizado. XAYVEN da un precio cerrado después de entender el alcance real.",
          },
          {
            question: "¿Qué pasarelas de pago se pueden integrar?",
            answer: "Depende del país y las necesidades del negocio — se define con XAYVEN durante el alcance del proyecto.",
          },
          {
            question: "¿Incluye gestión de inventario?",
            answer: "Sí, el panel administrativo permite gestionar productos, variantes y estados de pedido.",
          },
          {
            question: "¿Puedo empezar con pocos productos y crecer después?",
            answer: "Sí, el catálogo está pensado para crecer — agregar productos y categorías no requiere rehacer el sitio.",
          },
          {
            question: "¿La tienda incluye SEO?",
            answer: "Sí, SEO técnico está incluido para que tus productos puedan ser encontrados en buscadores.",
          },
          {
            question: "¿Qué pasa después del lanzamiento, quién le hace mantenimiento?",
            answer: "Los planes Essential, Growth o Care+ cubren el mantenimiento continuo de la tienda después de publicada.",
          },
          {
            question: "¿Puedo ver un ejemplo real?",
            answer: "Sí — Tartalia Repostería es un proyecto real construido con este mismo enfoque, visible en /work.",
          },
        ],
      },
      en: {
        heading: "Online stores",
        tagline: "Sell directly online, without depending only on social media.",
        definition:
          "An online store with XAYVEN is a complete site with product catalog, cart, checkout and integrated payments, built so a visitor can buy without leaving the site or messaging you on WhatsApp for every question.",
        problem: [
          "You currently sell only through Instagram/WhatsApp and lose orders to messages that pile up or get lost.",
          "You have no way to show your full catalog in an organized way.",
          "Getting paid is manual: transfers, screenshots, confirmations over chat.",
          "There's no way to know which products actually sell best without going through every conversation.",
        ],
        solution:
          "XAYVEN builds the store as a system, not a showcase: catalog with categories and variants, cart, checkout with integrated online payments, order management and an admin panel so you control inventory and order status without needing a developer for every change.",
        includes: [
          "Product catalog with categories and variants",
          "Cart and checkout",
          "Integrated online payments",
          "Order management and order status",
          "Client management",
          "Promotions and discounts",
          "Advanced analytics",
          "Admin panel",
          "SEO and WhatsApp integration",
        ],
        forWhom: {
          idealIf: [
            "Businesses selling physical or digital products that want to charge directly on the site.",
            "Brands already selling on social media that need an organized catalog and checkout.",
          ],
          notIdealIf: ["You only need to show company information without selling directly — see Web Design and Development."],
        },
        useCases: [
          "Tartalia Repostería: product catalog, orders and reservations on its own site, with a complete technical SEO base (real project, see /work).",
        ],
        faq: [
          {
            question: "How much does an online store cost?",
            answer:
              "From $3,499,000 COP, one-time payment. The final price depends on the number of products, variants, inventory and integrations your store needs.",
          },
          {
            question: "Why is the price 'from' and not a fixed amount?",
            answer:
              "Because real scope varies a lot between businesses: number of products, shipping, invoicing, custom checkout. XAYVEN gives a closed price after understanding the real scope.",
          },
          {
            question: "Which payment gateways can be integrated?",
            answer: "It depends on the country and the business's needs — defined with XAYVEN during project scoping.",
          },
          {
            question: "Does it include inventory management?",
            answer: "Yes, the admin panel lets you manage products, variants and order status.",
          },
          {
            question: "Can I start with few products and grow later?",
            answer: "Yes, the catalog is built to grow — adding products and categories doesn't require rebuilding the site.",
          },
          {
            question: "Does the store include SEO?",
            answer: "Yes, technical SEO is included so your products can be found in search engines.",
          },
          {
            question: "What happens after launch — who maintains it?",
            answer: "The Essential, Growth or Care+ plans cover ongoing maintenance of the store after it's published.",
          },
          {
            question: "Can I see a real example?",
            answer: "Yes — Tartalia Repostería is a real project built with this same approach, visible on /work.",
          },
        ],
      },
    },
  },
  {
    slug: "seo",
    displayOrder: 2,
    isPublished: true,
    relatedPackageSlugs: [],
    content: {
      es: {
        heading: "SEO",
        tagline: "Que te encuentren en Google cuando buscan lo que ofreces.",
        definition:
          "SEO (Search Engine Optimization) es el trabajo técnico y de contenido que hace que buscadores como Google entiendan, indexen y posicionen tu sitio para las búsquedas relevantes a tu negocio.",
        problem: [
          "Tu sitio existe pero nadie lo encuentra buscando en Google.",
          "No sabes si tu web tiene errores técnicos que le impiden ser indexada correctamente.",
          "Compites contra negocios que aparecen primero simplemente porque su base técnica es mejor.",
          "El contenido del sitio no responde las preguntas reales que hace tu cliente potencial.",
        ],
        solution:
          "XAYVEN aborda SEO en dos capas: la base técnica (metadata, velocidad, estructura, sitemap, datos estructurados) que todo sitio construido por XAYVEN ya trae desde el diseño y desarrollo, y la optimización continua (contenido, palabras clave, seguimiento) para negocios que necesitan competir activamente por posiciones en buscadores.",
        includes: [
          "Metadata (title, description) optimizada por página",
          "URLs canónicas y sitemap",
          "Datos estructurados (Schema.org) cuando aplica",
          "Rendimiento técnico (velocidad de carga)",
          "SEO técnico incluido de base en todos los paquetes de desarrollo web",
          "Optimización continua disponible como funcionalidad adicional o dentro de Growth/Care+",
        ],
        forWhom: {
          idealIf: [
            "Negocios que dependen de que clientes nuevos los encuentren buscando en Google.",
            "Sitios ya existentes con problemas técnicos de indexación o posicionamiento.",
          ],
          notIdealIf: ["Buscas resultados garantizados en un plazo fijo — ningún proveedor serio de SEO puede prometer eso, incluido XAYVEN."],
        },
        useCases: [
          "Un negocio local necesita aparecer cuando alguien busca su servicio más su ciudad.",
          "Una web ya existente pierde tráfico por errores técnicos nunca corregidos.",
        ],
        faq: [
          {
            question: "¿Cuánto cuesta el SEO?",
            answer:
              "El SEO técnico de base está incluido en todos los paquetes de desarrollo web. La optimización continua se cotiza según el alcance — hoy no existe un paquete cerrado de SEO independiente.",
          },
          {
            question: "¿XAYVEN garantiza posición #1 en Google?",
            answer:
              "No. Ningún proveedor honesto puede garantizar una posición específica — Google no lo permite ni lo controla nadie externamente. Sí se puede garantizar una base técnica correcta y un trabajo real de optimización.",
          },
          {
            question: "¿En cuánto tiempo se ven resultados?",
            answer: "El SEO es un trabajo de mediano plazo, no de días. Los tiempos varían según la competencia de tu sector y el estado inicial del sitio.",
          },
          {
            question: "¿Necesito un sitio nuevo o sirve para uno que ya tengo?",
            answer: "Sirve para ambos casos — un sitio existente puede auditarse y corregirse técnicamente sin reconstruirlo desde cero.",
          },
          {
            question: "¿Qué es SEO técnico exactamente?",
            answer: "Es la parte de SEO que depende del código del sitio: velocidad, estructura, metadata, sitemap, datos estructurados.",
          },
          {
            question: "¿El SEO incluye contenido/blog?",
            answer: "Depende del alcance acordado — se define caso por caso, no es un incluido fijo de un paquete cerrado hoy.",
          },
          {
            question: "¿Sirve para negocios locales?",
            answer: "Sí, SEO local (aparecer en búsquedas con ubicación) es uno de los casos de uso más comunes.",
          },
          {
            question: "¿Cómo empiezo?",
            answer: "Cuéntale a XAYVEN AI tu situación actual o escríbenos directamente — evaluamos el estado real de tu sitio antes de proponer un alcance.",
          },
        ],
      },
      en: {
        heading: "SEO",
        tagline: "Get found on Google when people search for what you offer.",
        definition:
          "SEO (Search Engine Optimization) is the technical and content work that lets search engines like Google understand, index and rank your site for the searches relevant to your business.",
        problem: [
          "Your site exists but nobody finds it searching on Google.",
          "You don't know if your site has technical errors that keep it from being indexed correctly.",
          "You're losing to competitors that rank higher simply because their technical foundation is better.",
          "The site's content doesn't answer the real questions your potential clients are asking.",
        ],
        solution:
          "XAYVEN approaches SEO in two layers: the technical foundation (metadata, speed, structure, sitemap, structured data) that every XAYVEN-built site already has from design and development, and ongoing optimization (content, keywords, tracking) for businesses that need to actively compete for search rankings.",
        includes: [
          "Optimized metadata (title, description) per page",
          "Canonical URLs and sitemap",
          "Structured data (Schema.org) where it applies",
          "Technical performance (load speed)",
          "Basic technical SEO included by default in every web development package",
          "Ongoing optimization available as an add-on or within Growth/Care+",
        ],
        forWhom: {
          idealIf: [
            "Businesses that depend on new clients finding them through Google.",
            "Existing sites with technical indexing or ranking problems.",
          ],
          notIdealIf: ["You're looking for guaranteed results on a fixed timeline — no honest SEO provider, XAYVEN included, can promise that."],
        },
        useCases: [
          "A local business needs to show up when someone searches for its service plus its city.",
          "An existing site is losing traffic to technical errors that were never fixed.",
        ],
        faq: [
          {
            question: "How much does SEO cost?",
            answer:
              "Basic technical SEO is included in every web development package. Ongoing optimization is quoted by scope — there's no standalone closed SEO package today.",
          },
          {
            question: "Does XAYVEN guarantee #1 on Google?",
            answer:
              "No. No honest provider can guarantee a specific ranking — Google doesn't allow it and nobody controls it externally. What can be guaranteed is a correct technical foundation and real optimization work.",
          },
          {
            question: "How long until I see results?",
            answer: "SEO is a mid-term effort, not days. Timelines vary with how competitive your industry is and the site's starting condition.",
          },
          {
            question: "Do I need a new site, or does this work for one I already have?",
            answer: "Both — an existing site can be audited and technically fixed without rebuilding it from scratch.",
          },
          {
            question: "What exactly is technical SEO?",
            answer: "The part of SEO that depends on the site's code: speed, structure, metadata, sitemap, structured data.",
          },
          {
            question: "Does SEO include content/blog work?",
            answer: "Depends on the agreed scope — defined case by case, not a fixed inclusion of a closed package today.",
          },
          {
            question: "Does it work for local businesses?",
            answer: "Yes, local SEO (showing up in location-based searches) is one of the most common use cases.",
          },
          {
            question: "How do I start?",
            answer: "Tell XAYVEN AI about your current situation, or message us directly — we evaluate your site's real state before proposing a scope.",
          },
        ],
      },
    },
  },
  {
    slug: "automation",
    displayOrder: 3,
    isPublished: true,
    relatedPackageSlugs: [],
    content: {
      es: {
        heading: "Automatización",
        tagline: "Menos trabajo manual repetitivo, más tiempo en lo que realmente hace crecer tu negocio.",
        definition:
          "Automatización es conectar herramientas y flujos de trabajo (formularios, WhatsApp, correo, pagos, CRMs) para que las tareas repetitivas ocurran solas, sin que alguien tenga que hacerlas manualmente cada vez.",
        problem: [
          "Cada lead que llega por el formulario o WhatsApp se gestiona manualmente, uno por uno.",
          "La información de clientes vive dispersa entre WhatsApp, correo y hojas de cálculo.",
          "Tareas repetitivas (confirmaciones, recordatorios, seguimientos) consumen tiempo que podría usarse en atender al cliente.",
        ],
        solution:
          "XAYVEN identifica los procesos manuales reales del negocio y los conecta mediante integraciones y flujos automáticos — por ejemplo, que un formulario complete automáticamente el panel de gestión de clientes, o que XAYVEN AI filtre y organice leads antes de que un humano los revise.",
        includes: [
          "Integraciones entre formularios, WhatsApp y panel administrativo",
          "Flujos de notificación automática",
          "Conexión con XAYVEN AI para filtrado y calificación inicial de leads",
          "Integraciones con herramientas externas según el caso",
        ],
        forWhom: {
          idealIf: [
            "Negocios que reciben suficiente volumen de contactos como para que gestionarlos manualmente sea un cuello de botella real.",
            "Negocios que ya tienen un sitio con XAYVEN y quieren que sus herramientas se conecten entre sí.",
          ],
          notIdealIf: ["El volumen actual de contactos es bajo y gestionarlo manualmente no es realmente un problema todavía."],
        },
        useCases: [
          "Un negocio que recibe leads por WhatsApp y formulario web los ve organizados automáticamente en un único panel, con XAYVEN AI haciendo la primera calificación.",
        ],
        faq: [
          {
            question: "¿Cuánto cuesta la automatización?",
            answer:
              "Se cotiza según el alcance. El valor final depende de las herramientas que se conecten, la complejidad de la integración y los requerimientos específicos del proyecto.",
          },
          {
            question: "¿Necesito ya tener un sitio con XAYVEN?",
            answer:
              "No es obligatorio, pero la mayoría de las automatizaciones parten de conectar el sitio/formularios con el resto de tus herramientas, así que ayuda mucho tenerlo.",
          },
          {
            question: "¿Qué herramientas se pueden conectar?",
            answer: "Depende del caso — se evalúa qué usa realmente tu negocio hoy (WhatsApp, correo, CRM, hojas de cálculo) antes de proponer una integración.",
          },
          {
            question: "¿Esto reemplaza tener un equipo de atención?",
            answer: "No, automatiza tareas repetitivas — la atención real a un cliente sigue siendo humana donde importa. Libera tiempo, no lo reemplaza.",
          },
          {
            question: "¿Es lo mismo que XAYVEN AI?",
            answer:
              "Están relacionados pero no son lo mismo: XAYVEN AI es el asistente conversacional; automatización es la conexión de procesos y herramientas detrás de escena, que puede incluir a XAYVEN AI como una pieza.",
          },
          {
            question: "¿Qué tan rápido se implementa?",
            answer: "Depende de cuántas herramientas y qué tan compleja sea la integración — se define un alcance y tiempo reales después de evaluar el caso.",
          },
          {
            question: "¿Sirve si mi negocio es pequeño?",
            answer: "Sirve si el volumen de tareas repetitivas ya es un problema real, sin importar el tamaño del negocio.",
          },
          {
            question: "¿Cómo sé qué automatización necesito?",
            answer: "Cuéntale a XAYVEN AI cómo gestionas hoy tus contactos/pedidos — es el punto de partida más rápido para identificar qué automatizar primero.",
          },
        ],
      },
      en: {
        heading: "Automation",
        tagline: "Less repetitive manual work, more time on what actually grows your business.",
        definition:
          "Automation is connecting tools and workflows (forms, WhatsApp, email, payments, CRMs) so repetitive tasks happen on their own, instead of someone doing them by hand every time.",
        problem: [
          "Every lead that comes through the form or WhatsApp gets handled manually, one by one.",
          "Client information is scattered across WhatsApp, email and spreadsheets.",
          "Repetitive tasks (confirmations, reminders, follow-ups) eat time that could go toward serving clients.",
        ],
        solution:
          "XAYVEN identifies the business's real manual processes and connects them through integrations and automated flows — for example, a form that automatically populates the client management panel, or XAYVEN AI filtering and organizing leads before a human reviews them.",
        includes: [
          "Integrations between forms, WhatsApp and the admin panel",
          "Automatic notification flows",
          "Connection with XAYVEN AI for initial lead filtering and qualification",
          "Integrations with external tools depending on the case",
        ],
        forWhom: {
          idealIf: [
            "Businesses receiving enough contact volume that managing it manually is a real bottleneck.",
            "Businesses that already have a XAYVEN site and want their tools connected to each other.",
          ],
          notIdealIf: ["Your current contact volume is low and handling it manually isn't really a problem yet."],
        },
        useCases: [
          "A business receiving leads via WhatsApp and a web form sees them automatically organized in one panel, with XAYVEN AI doing the first qualification pass.",
        ],
        faq: [
          {
            question: "How much does automation cost?",
            answer:
              "It is quoted based on scope. The final price depends on the tools being connected, the complexity of the integration, and the project's specific requirements.",
          },
          {
            question: "Do I already need a site with XAYVEN?",
            answer: "Not required, but most automations start by connecting the site/forms to the rest of your tools, so it helps a lot to have one.",
          },
          {
            question: "Which tools can be connected?",
            answer: "Depends on the case — we evaluate what your business actually uses today (WhatsApp, email, CRM, spreadsheets) before proposing an integration.",
          },
          {
            question: "Does this replace having a support team?",
            answer: "No, it automates repetitive tasks — real client attention stays human where it matters. It frees up time, it doesn't replace people.",
          },
          {
            question: "Is this the same as XAYVEN AI?",
            answer:
              "Related but not the same: XAYVEN AI is the conversational assistant; automation is the connection of processes and tools behind the scenes, which can include XAYVEN AI as one piece.",
          },
          {
            question: "How fast does it get implemented?",
            answer: "Depends on how many tools and how complex the integration is — a real scope and timeline is defined after evaluating the case.",
          },
          {
            question: "Does it work for a small business?",
            answer: "It works if the volume of repetitive tasks is already a real problem, regardless of business size.",
          },
          {
            question: "How do I know which automation I need?",
            answer: "Tell XAYVEN AI how you currently manage your contacts/orders — it's the fastest starting point to identify what to automate first.",
          },
        ],
      },
    },
  },
  {
    slug: "custom-solutions",
    displayOrder: 4,
    isPublished: true,
    relatedPackageSlugs: ["custom"],
    content: {
      es: {
        heading: "Soluciones personalizadas",
        tagline: "Para proyectos que no caben en un paquete estándar.",
        definition:
          "Desarrollo personalizado es la construcción de plataformas, sistemas o aplicaciones web hechas completamente a la medida, cuando lo que necesitas excede lo que un sitio o tienda estándar puede resolver.",
        problem: [
          "Tu proyecto necesita un sistema interno, un dashboard o una plataforma, no solo un sitio informativo.",
          "Necesitas una lógica de negocio específica que ningún paquete cerrado contempla.",
          "Ya tienes un sistema pero necesita integrarse con herramientas o procesos particulares de tu operación.",
        ],
        solution:
          "XAYVEN diseña y construye la solución desde cero según el alcance real del proyecto, sin forzarlo dentro de un paquete que no le queda. Esto incluye definir arquitectura, funcionalidades y prioridades junto contigo antes de escribir una sola línea de código.",
        includes: [
          "Plataformas web a medida",
          "Dashboards y paneles internos",
          "Sistemas de reservas complejos",
          "Membresías",
          "Automatizaciones avanzadas e integraciones personalizadas",
          "Aplicaciones web y sistemas empresariales",
        ],
        forWhom: {
          idealIf: [
            "Proyectos que exceden claramente el alcance de un sitio o tienda estándar.",
            "Negocios con procesos internos específicos que necesitan una herramienta propia.",
          ],
          notIdealIf: ["Un sitio o tienda estándar ya resolvería lo que necesitas — revisa primero Diseño y desarrollo web o Tiendas online, suele ser más rápido y económico."],
        },
        useCases: [
          "Un negocio necesita un sistema de reservas con reglas específicas que no cubre un paquete estándar.",
          "Una empresa necesita un panel interno para gestionar su propia operación, no un sitio público.",
        ],
        faq: [
          {
            question: "¿Cuánto cuesta un desarrollo personalizado?",
            answer:
              "Desde $6.000.000 COP. El precio final se cotiza según el alcance real del proyecto — no hay un precio cerrado porque cada proyecto personalizado es distinto por definición.",
          },
          {
            question: "¿Cómo se define el alcance?",
            answer: "XAYVEN se reúne contigo para entender el problema real antes de proponer una solución y un precio — nunca se cotiza sin entender el proyecto primero.",
          },
          {
            question: "¿Cuánto tiempo toma?",
            answer: "Varía mucho según la complejidad — se define un cronograma real como parte de la propuesta, no antes.",
          },
          {
            question: "¿Esto incluye mantenimiento después?",
            answer: "El mantenimiento continuo se cubre con los planes Essential, Growth o Care+, igual que con cualquier otro proyecto de XAYVEN.",
          },
          {
            question: "¿Puedo empezar con un MVP y crecer después?",
            answer: "Sí, es una de las formas más comunes de abordar un desarrollo personalizado — se define junto contigo si tiene sentido para tu caso.",
          },
          {
            question: "¿Qué tan seguro puedo estar de que el resultado va a funcionar como necesito?",
            answer: "El proceso de XAYVEN (ver /process) incluye definición clara de alcance antes de construir, exactamente para reducir ese riesgo.",
          },
          {
            question: "¿Qué diferencia hay entre esto y un paquete de desarrollo web estándar?",
            answer:
              "Los paquetes estándar (START/PROFESSIONAL/BUSINESS) tienen un alcance predefinido. Un desarrollo personalizado no tiene un molde — se construye la solución específica que tu proyecto necesita.",
          },
          {
            question: "¿Cómo empiezo?",
            answer: "Cuéntale a XAYVEN AI tu proyecto o escríbenos directamente — es el primer paso para definir si necesitas un desarrollo personalizado o un paquete estándar te resuelve mejor.",
          },
        ],
      },
      en: {
        heading: "Custom solutions",
        tagline: "For projects that don't fit a standard package.",
        definition:
          "Custom development is building platforms, systems or web applications entirely to spec, when what you need exceeds what a standard site or store can solve.",
        problem: [
          "Your project needs an internal system, a dashboard or a platform, not just an informational site.",
          "You need specific business logic that no closed package accounts for.",
          "You already have a system but it needs to integrate with tools or processes specific to your operation.",
        ],
        solution:
          "XAYVEN designs and builds the solution from scratch based on the project's real scope, instead of forcing it into a package that doesn't fit. This includes defining architecture, features and priorities together with you before writing a single line of code.",
        includes: [
          "Custom web platforms",
          "Dashboards and internal panels",
          "Complex reservation systems",
          "Memberships",
          "Advanced automations and custom integrations",
          "Web applications and enterprise systems",
        ],
        forWhom: {
          idealIf: [
            "Projects that clearly exceed the scope of a standard site or store.",
            "Businesses with specific internal processes that need their own tool.",
          ],
          notIdealIf: ["A standard site or store would already solve what you need — check Web Design and Development or E-commerce first, usually faster and cheaper."],
        },
        useCases: [
          "A business needs a reservation system with specific rules that a standard package doesn't cover.",
          "A company needs an internal panel to manage its own operation, not a public-facing site.",
        ],
        faq: [
          {
            question: "How much does custom development cost?",
            answer:
              "From $6,000,000 COP. The final price is quoted based on the project's real scope — there's no closed price because every custom project is different by definition.",
          },
          {
            question: "How is the scope defined?",
            answer: "XAYVEN meets with you to understand the real problem before proposing a solution and a price — never quoted without understanding the project first.",
          },
          {
            question: "How long does it take?",
            answer: "Varies a lot with complexity — a real timeline is defined as part of the proposal, not before.",
          },
          {
            question: "Does this include maintenance afterward?",
            answer: "Ongoing maintenance is covered by the Essential, Growth or Care+ plans, same as any other XAYVEN project.",
          },
          {
            question: "Can I start with an MVP and grow later?",
            answer: "Yes, it's one of the most common ways to approach custom development — defined together with you if it makes sense for your case.",
          },
          {
            question: "How confident can I be that the result will work the way I need?",
            answer: "XAYVEN's process (see /process) includes clear scope definition before building, exactly to reduce that risk.",
          },
          {
            question: "What's the difference between this and a standard web development package?",
            answer:
              "Standard packages (START/PROFESSIONAL/BUSINESS) have a predefined scope. Custom development has no mold — it builds the specific solution your project needs.",
          },
          {
            question: "How do I start?",
            answer: "Tell XAYVEN AI about your project or message us directly — the first step to figuring out if you need custom development or if a standard package fits better.",
          },
        ],
      },
    },
  },
];

/** Lazily seeds the in-memory store exactly once per process — mirrors
 *  the migration's `ON CONFLICT (slug) DO NOTHING` idempotency, same
 *  pattern as pricingCatalogStore.ts's ensureMemorySeeded(). Deterministic
 *  synthetic ids (`seed-<slug>`) since nothing depends on them matching
 *  real Postgres uuids — only `slug` is ever used as the stable
 *  reference. */
function ensureMemorySeeded(): void {
  if (memoryStore.size > 0) return;
  const timestamp = nowIso();
  for (const item of SEED_SERVICES) {
    const id = `seed-${item.slug}`;
    memoryStore.set(id, { ...item, id, createdAt: timestamp, updatedAt: timestamp });
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listServices(options?: { publishedOnly?: boolean }): Promise<Service[]> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    ensureMemorySeeded();
    return [...memoryStore.values()]
      .filter((s) => !options?.publishedOnly || s.isPublished)
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }

  let query = supabase.from("services").select("*").order("display_order", { ascending: true });
  if (options?.publishedOnly) query = query.eq("is_published", true);

  const { data } = await query;
  return (data ?? []).map((row) => rowToService(row as ServiceRow));
}

export async function getServiceBySlug(slug: string): Promise<Service | null> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    ensureMemorySeeded();
    return [...memoryStore.values()].find((s) => s.slug === slug) ?? null;
  }

  const { data } = await supabase.from("services").select("*").eq("slug", slug).maybeSingle();
  return data ? rowToService(data as ServiceRow) : null;
}

export async function getServiceById(id: string): Promise<Service | null> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    ensureMemorySeeded();
    return memoryStore.get(id) ?? null;
  }

  const { data } = await supabase.from("services").select("*").eq("id", id).maybeSingle();
  return data ? rowToService(data as ServiceRow) : null;
}

// ---------------------------------------------------------------------------
// Writes — ready for the future Admin CRUD (Phase 5). Never falls back to
// memory on a real Supabase error; explicit field whitelist always, never
// a raw spread. Same discipline as promotionStore.ts.
// ---------------------------------------------------------------------------

export class ServiceNotFoundError extends Error {
  constructor(id: string) {
    super(`Service not found: ${id}`);
    this.name = "ServiceNotFoundError";
  }
}

export class ServiceSlugConflictError extends Error {
  constructor(slug: string) {
    super(`A service with slug "${slug}" already exists.`);
    this.name = "ServiceSlugConflictError";
  }
}

export async function createService(input: CreateServiceInput): Promise<Service> {
  const supabase = getSupabaseAdmin();
  const now = nowIso();
  const draft: Service = {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    slug: input.slug,
    displayOrder: input.displayOrder,
    isPublished: input.isPublished,
    relatedPackageSlugs: input.relatedPackageSlugs,
    content: input.content,
  };

  if (!supabase) {
    ensureMemorySeeded();
    if ([...memoryStore.values()].some((s) => s.slug === draft.slug)) {
      throw new ServiceSlugConflictError(draft.slug);
    }
    memoryStore.set(draft.id, draft);
    return draft;
  }

  const { data, error } = await supabase
    .from("services")
    .insert({
      id: draft.id,
      slug: draft.slug,
      display_order: draft.displayOrder,
      is_published: draft.isPublished,
      related_package_slugs: draft.relatedPackageSlugs,
      content_es: draft.content.es,
      content_en: draft.content.en,
    })
    .select("*")
    .single();

  if (error || !data) {
    if (error?.code === "23505") throw new ServiceSlugConflictError(draft.slug);
    throw new Error(`[services] createService failed: ${error?.code ?? "unknown"} ${error?.message ?? ""}`);
  }

  return rowToService(data as ServiceRow);
}

/** Explicit field-by-field whitelist in BOTH branches — never a raw
 *  `{...current, ...patch}` spread. `slug` is never editable here (see
 *  UpdateServiceInput's doc comment in types.ts). */
export async function updateService(id: string, patch: UpdateServiceInput): Promise<Service> {
  const current = await getServiceById(id);
  if (!current) throw new ServiceNotFoundError(id);

  const updated: Service = {
    ...current,
    displayOrder: patch.displayOrder !== undefined ? patch.displayOrder : current.displayOrder,
    isPublished: patch.isPublished !== undefined ? patch.isPublished : current.isPublished,
    relatedPackageSlugs: patch.relatedPackageSlugs !== undefined ? patch.relatedPackageSlugs : current.relatedPackageSlugs,
    content: patch.content !== undefined ? patch.content : current.content,
    updatedAt: nowIso(),
  };

  const supabase = getSupabaseAdmin();

  if (!supabase) {
    memoryStore.set(id, updated);
    return updated;
  }

  const { data, error } = await supabase
    .from("services")
    .update({
      display_order: updated.displayOrder,
      is_published: updated.isPublished,
      related_package_slugs: updated.relatedPackageSlugs,
      content_es: updated.content.es,
      content_en: updated.content.en,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`[services] updateService failed: ${error?.code ?? "unknown"} ${error?.message ?? ""}`);
  }

  return rowToService(data as ServiceRow);
}

export async function setServicePublished(id: string, isPublished: boolean): Promise<Service> {
  return updateService(id, { isPublished });
}
