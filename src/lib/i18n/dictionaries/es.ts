import type { Dictionary } from "../dictionary";

export const es: Dictionary = {
  meta: {
    siteName: "XAYVEN",
    titleTemplate: "%s · XAYVEN",
    defaultTitle: "XAYVEN — Estudio digital de diseño y desarrollo web",
    defaultDescription:
      "XAYVEN es un estudio digital que diseña y construye sitios web estratégicos para negocios que quieren una presencia online a la altura de su marca.",
  },
  nav: {
    home: "Inicio",
    work: "Trabajo",
    services: "Servicios",
    process: "Proceso",
    about: "Estudio",
    contact: "Contacto",
    maintenance: "Mantenimiento",
    ctaPrimary: "Crear mi proyecto",
    openMenu: "Abrir menú",
    closeMenu: "Cerrar menú",
    languageSwitcherLabel: "Cambiar idioma",
    loginCta: "Iniciar sesión",
    accountCta: "Mi cuenta",
  },
  hero: {
    eyebrow: "XAYVEN — Digital Studio",
    headline: "Tu negocio merece una web que",
    headlineAccent: "cierre tratos, no que los pierda.",
    subheadline:
      "Diseñamos y desarrollamos sitios web estratégicos para negocios que quieren verse — y funcionar — como la mejor versión de sí mismos.",
    ctaPrimary: "Crear mi proyecto",
    ctaSecondary: "Ver nuestro trabajo",
    visualCaption: "Estrategia, diseño y desarrollo bajo un mismo equipo.",
    pillars: {
      strategy: "Estrategia",
      design: "Diseño",
      development: "Desarrollo",
    },
  },
  trust: {
    heading: "Cómo trabajamos, en corto",
    items: [
      {
        title: "Diseño a medida",
        description: "Cada proyecto se construye desde cero. Sin plantillas genéricas.",
      },
      {
        title: "Código propio",
        description: "Desarrollo limpio, rápido y pensado para crecer con tu negocio.",
      },
      {
        title: "Enfoque en conversión",
        description: "Cada sección de tu web tiene un propósito: convertir visitas en clientes.",
      },
      {
        title: "Bilingüe desde el origen",
        description: "Tu sitio listo para hablarle a más clientes, en español e inglés.",
      },
    ],
  },
  services: {
    eyebrow: "Servicios",
    heading: "Qué construimos",
    description:
      "No vendemos horas de código. Vendemos estrategia, diseño y desarrollo trabajando juntos para conseguirte resultados.",
    ctaLabel: "Ver todos los servicios",
    // Services Phase 10 (QA/dead-code cleanup) — `items`/`fieldLabels`
    // (el contenido legacy de 5 servicios distintos a los reales)
    // eliminados: desde Services Phase 6, XAYVEN AI también lee
    // servicesStore.ts — quedaron sin ningún consumidor real, confirmado
    // por grep exhaustivo antes de borrarlos. El contenido real de cada
    // servicio vive en servicesStore.ts.
    viewService: "Ver servicio",
    priceFrom: "Desde",
    priceQuote: "Cotización personalizada",
    aiHelp: {
      heading: "¿No sabes qué servicio necesitas?",
      description: "Cuéntale a XAYVEN AI tu situación y te ayuda a identificar el servicio correcto.",
      cta: "Habla con XAYVEN AI",
    },
  },
  why: {
    eyebrow: "Por qué XAYVEN",
    heading: "Un solo equipo, un solo criterio",
    description:
      "La mayoría de webs fallan porque el diseño, el desarrollo y la estrategia los hacen equipos distintos que no se hablan entre sí. Nosotros trabajamos distinto.",
    items: [
      {
        title: "Diseño propio, no plantillas",
        description: "Cada proyecto se construye desde cero, pensado para tu marca y tu negocio.",
      },
      {
        title: "Código limpio y rápido",
        description: "Sitios optimizados para velocidad y buscadores desde el primer día.",
      },
      {
        title: "Proceso claro",
        description: "Sabes qué esperar en cada etapa del proyecto, sin sorpresas de último momento.",
      },
      {
        title: "Bilingüe desde el origen",
        description: "Español e inglés integrados en la arquitectura, no traducidos por encima.",
      },
      {
        title: "Estrategia, diseño y desarrollo juntos",
        description: "Un mismo equipo piensa el negocio, el diseño y la construcción del sitio.",
      },
      {
        title: "Comunicación directa",
        description: "Hablas con quien construye tu proyecto, no con un intermediario comercial.",
      },
    ],
  },
  // Services Phase 3 — /services/[slug]. Generic UI copy/section labels
  // shared across every service detail page; the actual editorial
  // content (heading, definition, problem, solution, includes, forWhom,
  // useCases, faq) lives per-service in servicesStore.ts, never here.
  serviceDetail: {
    definitionHeading: "¿Qué es?",
    problemHeading: "El problema",
    solutionHeading: "La solución XAYVEN",
    includesHeading: "Qué incluye",
    forWhomHeading: "Para quién es",
    idealIfLabel: "Ideal si...",
    notIdealIfLabel: "Puede no ser la solución si...",
    useCasesHeading: "Casos de uso",
    workLinkLabel: "Ver proyectos reales",
    pricingHeading: "Precios",
    priceQuoteExplanation: "Este servicio no tiene un paquete cerrado — se cotiza según el alcance real de tu proyecto.",
    processHeading: "Cómo trabajamos",
    processDescription: "Mismo proceso para todos los servicios de XAYVEN — diseño, desarrollo y estrategia bajo un mismo equipo.",
    processLinkLabel: "Ver el proceso completo",
    faqHeading: "Preguntas frecuentes",
    faqDescription: "Lo que más nos preguntan sobre este servicio.",
    relatedHeading: "Otros servicios",
    choosePackageLabel: "Elegir este paquete",
    // SEO/AEO/GEO Phase 8 — internal linking explícito (§39 del prompt
    // maestro): Maintenance y Diagnosis, ninguno de los dos enlazado
    // desde el detalle de servicio hasta esta fase.
    exploreMoreHeading: "Explora más",
    maintenanceLinkLabel: "¿Ya tienes web? Conoce Mantenimiento",
    diagnosisLinkLabel: "¿No sabes qué necesitas? Haz el diagnóstico",
  },
  work: {
    eyebrow: "Trabajo seleccionado",
    heading: "Proyectos que hemos construido",
    description:
      "Un proyecto real, y exploraciones conceptuales que muestran cómo pensamos el diseño para distintos tipos de negocio.",
    ctaLabel: "Ver todo el trabajo",
    conceptBadge: "Proyecto conceptual",
    realBadge: "Proyecto real",
    viewCase: "Ver caso completo",
    backToWork: "Volver a trabajo",
    fields: {
      problem: "Problema",
      goal: "Objetivo",
      solution: "Solución",
      design: "Diseño",
      tech: "Tecnología",
      result: "Resultado",
    },
    empty: "Todavía no hay proyectos en esta categoría.",
    nextProject: "Siguiente proyecto",
  },
  process: {
    eyebrow: "Proceso",
    heading: "Cómo trabajamos",
    description:
      "Un proceso claro, pensado para reducir la incertidumbre — sabes qué sigue en cada etapa.",
    steps: [
      {
        number: "01",
        title: "Descubrimiento",
        description:
          "Entendemos tu negocio: a quién le vendes, qué te diferencia y qué necesita realmente tu web.",
      },
      {
        number: "02",
        title: "Estrategia",
        description:
          "Definimos objetivos, estructura del sitio y la experiencia que va a tener cada visitante.",
      },
      {
        number: "03",
        title: "Diseño",
        description:
          "Creamos la identidad visual y la experiencia de usuario, pensadas para tu marca y tu público.",
      },
      {
        number: "04",
        title: "Desarrollo",
        description:
          "Construimos el sitio con código propio, cuidando rendimiento, accesibilidad y detalle.",
      },
      {
        number: "05",
        title: "Lanzamiento",
        description:
          "Probamos, optimizamos y publicamos. Tu web sale al mundo lista para recibir visitas.",
      },
      {
        number: "06",
        title: "Evolución",
        description:
          "Seguimos mejorando el sitio cuando tu negocio lo necesita — no desaparecemos después del lanzamiento.",
      },
    ],
  },
  capabilities: {
    eyebrow: "Para quién trabajamos",
    heading: "Construimos para todo tipo de negocio",
    description:
      "XAYVEN no está limitada a empresas de tecnología. Diseñamos y desarrollamos para negocios de cualquier sector que quieran una presencia digital seria.",
    items: [
      "Restaurantes",
      "Tiendas y comercio local",
      "Negocios locales",
      "Profesionales independientes",
      "Inmobiliarias",
      "Ecommerce",
      "Empresas",
      "Marcas personales",
      "Startups",
      "Empresas de servicios",
      "Proyectos digitales",
    ],
  },
  trustBuilding: {
    eyebrow: "Confianza",
    heading: "Somos un estudio nuevo. Así lo compensamos.",
    description:
      "XAYVEN está empezando como marca — preferimos ser honestos al respecto antes que inventar cifras o clientes que no existen. Así es como trabajamos mientras construimos nuestro historial.",
    items: [
      {
        title: "Calidad en cada detalle",
        description: "Cuidamos el diseño y el código como si fuera nuestro propio negocio.",
      },
      {
        title: "Proyectos reales, mostrados tal como son",
        description: "Nunca vas a ver clientes, cifras o resultados inventados en esta web.",
      },
      {
        title: "Proceso transparente",
        description: "Sabes en qué etapa está tu proyecto y qué sigue, en todo momento.",
      },
      {
        title: "Atención directa",
        description: "Hablas con quien diseña y construye tu proyecto, no con un vendedor.",
      },
    ],
  },
  faq: {
    eyebrow: "Preguntas frecuentes",
    heading: "Antes de que preguntes",
    description: "Las dudas más comunes de quienes están por empezar un proyecto con nosotros.",
    items: [
      {
        question: "¿Cuánto cuesta un sitio web con XAYVEN?",
        answer:
          "Depende del alcance del proyecto: no es lo mismo una landing page que una tienda online completa. Después de entender tu negocio te damos un presupuesto claro, sin cifras genéricas de entrada.",
      },
      {
        question: "¿Cuánto tiempo toma construir mi web?",
        answer:
          "Varía según la complejidad. Una landing page puede tomar días; un sitio completo o una tienda online, algunas semanas. En la etapa de descubrimiento te damos un rango de tiempo concreto.",
      },
      {
        question: "¿Necesito tener listos los textos y las fotos antes de empezar?",
        answer:
          "No es obligatorio. Podemos apoyarte en esa parte, aunque el contenido propio siempre ayuda a que el resultado sea más fiel a tu marca.",
      },
      {
        question: "¿Trabajan con negocios que no son de tecnología?",
        answer:
          "Sí — la mayoría de los proyectos que nos interesan son de negocios locales, profesionales y marcas que no son tech: restaurantes, tiendas, inmobiliarias, servicios.",
      },
      {
        question: "¿Puedo pedir cambios después de que la web esté lista?",
        answer:
          "Sí. Ofrecemos mantenimiento y optimización continua para los sitios que construimos, para que sigan funcionando bien con el tiempo.",
      },
      {
        question: "¿Mi web puede estar en español e inglés?",
        answer:
          "Sí. Si tu negocio lo necesita, podemos construir tu sitio bilingüe desde el inicio, con la arquitectura preparada para más idiomas en el futuro.",
      },
      {
        question: "¿Qué necesitan de mí para empezar?",
        answer:
          "Completa el formulario de contacto contándonos sobre tu negocio y lo que buscas. A partir de ahí agendamos una primera conversación para entender el proyecto.",
      },
    ],
  },
  finalCta: {
    heading: "¿Listo para tener una web a la altura de tu negocio?",
    description:
      "Cuéntanos qué necesitas. Te respondemos con una propuesta concreta, no con un genérico \"contáctanos\".",
    ctaPrimary: "Crear mi proyecto",
    ctaSecondary: "Ver nuestro trabajo",
  },
  about: {
    eyebrow: "El estudio",
    heading: "Un estudio digital, no una fábrica de páginas",
    intro:
      "XAYVEN es un estudio digital enfocado en diseño y desarrollo web para negocios que quieren una presencia digital profesional. Combinamos estrategia, diseño y desarrollo bajo un mismo equipo, para que cada proyecto tenga una sola visión de principio a fin.",
    approachHeading: "Cómo pensamos el trabajo",
    approach:
      "Creemos que una buena web es simple de entender y difícil de olvidar. Priorizamos claridad sobre decoración, y conversión sobre efectos visuales que no aportan nada. Si una animación no mejora la experiencia, la eliminamos. Si una sección no tiene una función clara, tampoco tiene lugar en tu sitio.",
    valuesHeading: "Lo que no vas a encontrar aquí",
    values: [
      "Clientes o testimonios inventados.",
      "Estadísticas o cifras de crecimiento sin sustento.",
      "Plantillas genéricas reutilizadas entre proyectos.",
      "Promesas de resultados que no podemos garantizar.",
    ],
  },
  contact: {
    eyebrow: "Contacto",
    heading: "Empecemos tu proyecto",
    description:
      "Cuéntanos sobre tu negocio y lo que necesitas. Leemos cada mensaje y respondemos con información concreta, no con un formulario automático genérico.",
    directHeading: "Contacto directo",
    directEmail: "hello@xayven.com",
    directNote: "Respondemos en un plazo de 1 a 2 días hábiles.",
    form: {
      name: "Nombre",
      namePlaceholder: "Tu nombre completo",
      email: "Email",
      emailPlaceholder: "tu@email.com",
      company: "Empresa o negocio",
      companyPlaceholder: "Nombre de tu negocio (opcional)",
      projectType: "Tipo de proyecto",
      projectTypeOptions: [
        "Sitio web nuevo",
        "Renovación de sitio existente",
        "Tienda online",
        "Landing page",
        "Identidad de marca",
        "Otro",
      ],
      budget: "Presupuesto aproximado",
      budgetOptions: [
        "Menos de $1.000.000 COP",
        "$1.000.000 – $3.000.000 COP",
        "$3.000.000 – $6.000.000 COP",
        "Más de $6.000.000 COP",
        "Aún no lo sé",
      ],
      message: "Cuéntanos sobre tu proyecto",
      messagePlaceholder: "¿Qué necesitas? ¿Qué problema quieres resolver con tu web?",
      submit: "Enviar mensaje",
      submitting: "Enviando…",
      successTitle: "Mensaje recibido",
      successBody: "Gracias por escribirnos. Revisamos tu mensaje y te respondemos pronto a tu correo.",
      errorTitle: "Algo salió mal",
      errorBody: "No pudimos enviar tu mensaje. Intenta de nuevo o escríbenos directamente por correo.",
      retry: "Intentar de nuevo",
      requiredError: "Este campo es obligatorio.",
      emailError: "Ingresa un correo electrónico válido.",
      minLengthError: "Cuéntanos un poco más — al menos 20 caracteres.",
      selectedPlanLabel: "Plan seleccionado",
      changePlanLabel: "Quitar",
    },
  },
  footer: {
    tagline: "Estudio digital de diseño y desarrollo web.",
    navHeading: "Navegación",
    contactHeading: "Contacto",
    languageHeading: "Idioma",
    rights: "Todos los derechos reservados.",
    builtWith: "Diseñado y construido por XAYVEN.",
  },
  notFound: {
    eyebrow: "404",
    heading: "Esta página no existe",
    description: "Puede que el enlace esté roto o la página se haya movido.",
    cta: "Volver al inicio",
  },
  pages: {
    work: {
      title: "Trabajo",
      description:
        "Proyectos reales y exploraciones conceptuales de XAYVEN — diseño y desarrollo web para distintos tipos de negocio.",
    },
    services: {
      title: "Servicios",
      description:
        "Diseño web, desarrollo, ecommerce, landing pages, identidad digital y SEO. Servicios de XAYVEN, estudio digital.",
    },
    process: {
      title: "Proceso",
      description: "Cómo trabaja XAYVEN, de principio a fin: descubrimiento, estrategia, diseño, desarrollo, lanzamiento y evolución.",
    },
    about: {
      title: "Estudio",
      description: "Quiénes somos y cómo pensamos el diseño y desarrollo web en XAYVEN.",
    },
    contact: {
      title: "Contacto",
      description: "Empieza tu proyecto con XAYVEN. Cuéntanos sobre tu negocio y te respondemos con una propuesta concreta.",
    },
    maintenance: {
      title: "Mantenimiento",
      description:
        "Planes de mantenimiento web de XAYVEN: velocidad, seguridad y actualizaciones para que tu web siga funcionando bien.",
    },
    diagnosis: {
      title: "Diagnóstico web",
      description: "Responde 5 preguntas y descubre qué necesita realmente tu web.",
    },
    privacy: {
      title: "Privacidad",
      description: "Qué datos guarda XAYVEN, por qué, y cómo puedes solicitar que los eliminemos.",
    },
  },
  skipToContent: "Saltar al contenido",

  pricing: {
    displayCurrencyLabel: "Mostrar precios en",
    marketLabel: "Mercado comercial",
    marketExplanation: "Tu mercado determina el precio comercial. La moneda solo cambia cómo se muestra.",
    marketAutomaticLabel: "Detectar automáticamente",
    marketNames: {
      CO: "Colombia",
      US: "Estados Unidos",
      EU: "Europa",
      OTHER: "Otros mercados",
    },
    marketDetails: {
      CO: { currencyName: "Pesos colombianos", symbol: "$" },
      US: { currencyName: "Dólares estadounidenses", symbol: "$" },
      EU: { currencyName: "Euros", symbol: "€" },
      OTHER: { currencyName: null, symbol: "$" },
    },
    marketDetectedLabel: "Detectado automáticamente",
    marketManualLabel: "Seleccionado manualmente",
    marketFallbackLabel: "No pudimos determinar tu ubicación",
    marketFallbackCountryLabel: "Otros países",
    marketActiveLabel: "ACTIVA",
  },

  ai: {
    name: "XAYVEN AI",
    greeting:
      "Hola. Soy el asistente de XAYVEN.\nPuedo orientarte sobre nuestros servicios, mantenimiento, proyectos y proceso. Si quieres, también puedo ayudarte a descubrir qué necesita tu web.",
    suggestions: [
      "Quiero crear una web",
      "Ya tengo una web",
      "Necesito mantenimiento",
      "¿Cuánto cuesta una web?",
      "Quiero hablar con XAYVEN",
    ],
    inputPlaceholder: "Escribe tu mensaje…",
    sendLabel: "Enviar",
    openLabel: "Abrir XAYVEN AI",
    closeLabel: "Cerrar XAYVEN AI",
    availability: "En línea",
    thinking: "XAYVEN AI está escribiendo…",
    notConfiguredTitle: "XAYVEN AI todavía no está activo",
    notConfiguredBody:
      "Esta función está en configuración. Mientras tanto, puedes escribirnos por el formulario de contacto o por WhatsApp.",
    errorBody: "No pudimos enviar tu mensaje. Intenta de nuevo en un momento.",
    rateLimitedBody: "Vas un poco rápido — espera unos segundos antes de enviar otro mensaje.",
    consentNotice: "Tu conversación puede guardarse para que XAYVEN pueda darte seguimiento. Ver ",
    consentPrivacyLink: "política de privacidad",
    restart: "Nueva conversación",
  },

  whatsapp: {
    label: "Chatear por WhatsApp",
    defaultMessage: "Hola XAYVEN, estoy interesado en conocer más sobre sus servicios.",
    maintenanceMessage: "Hola XAYVEN, estoy interesado en mantenimiento para mi página web.",
  },

  maintenance: {
    eyebrow: "Mantenimiento",
    heading: "Tu web no termina cuando la lanzamos.",
    description:
      "La mantenemos rápida, segura y actualizada para que tú puedas concentrarte en tu negocio.",
    // Services/Maintenance Phase 4 — `slug` referencia pricing_catalog
    // (mismo principio "slug es la referencia estable" ya usado por
    // Services). `priceLabel` se eliminó de aquí — el precio real se
    // resuelve en la página contra Pricing Core, nunca hardcodeado.
    plans: [
      {
        slug: "essential",
        name: "Essential",
        tagline: "Lo básico, bien cuidado.",
        who: "Para sitios ya lanzados que necesitan seguir funcionando sin sorpresas.",
      },
      {
        slug: "growth",
        name: "Growth",
        tagline: "Mantenimiento con mejora continua.",
        who: "Para negocios que quieren que su web mejore con el tiempo, no solo que no se rompa.",
      },
      {
        slug: "care-plus",
        name: "Care+",
        tagline: "Acompañamiento cercano.",
        who: "Para negocios que quieren un equipo técnico disponible, sin contratar uno propio.",
      },
    ],
    perMonthSuffix: "/mes",
    priceUnavailable: "Consultar",
    ctaLabel: "Solicitar mantenimiento",
    featuredLabel: "Más elegido",
    about: {
      whatHeading: "¿Qué es XAYVEN Maintenance?",
      whatBody:
        "Es el servicio de mantenimiento continuo para sitios ya construidos por XAYVEN (o que XAYVEN adopta): hosting, seguridad, actualizaciones y soporte para que el sitio siga funcionando sin que tengas que pensar en ello.",
      whyHeading: "¿Por qué existe?",
      whyBody:
        "Un sitio web no termina el día que se publica — necesita actualizaciones, copias de seguridad, monitoreo y ajustes constantes. XAYVEN Maintenance existe para que esa responsabilidad no recaiga en ti.",
      problemsHeading: "Qué problemas resuelve",
      problems: [
        "Sitios abandonados que dejan de recibir actualizaciones de seguridad.",
        "Nadie responde cuando algo se rompe o el sitio se cae.",
        "Contenido desactualizado porque no hay una forma simple de pedir cambios.",
        "Cero visibilidad de cómo está funcionando realmente el sitio.",
      ],
    },
    comparisonHeading: "Comparación de planes",
    comparisonNote: "Los tres planes comparten la base de Essential — Growth y Care+ suman capacidad y prioridad, no la reemplazan.",
    comparisonPriceRow: "Precio",
    comparisonWhoRow: "Para quién",
    comparisonIncludesRow: "Incluye",
    faq: {
      eyebrow: "Mantenimiento",
      heading: "Preguntas frecuentes",
      description: "Lo que más nos preguntan sobre los planes de mantenimiento.",
      items: [
        {
          question: "¿Qué diferencia hay entre Essential, Growth y Care+?",
          answer:
            "Essential mantiene tu sitio funcionando (actualizaciones, monitoreo, backups, soporte por correo). Growth suma cambios de contenido periódicos, optimización y una revisión SEO recurrente. Care+ suma prioridad de respuesta, nuevas secciones pequeñas y acompañamiento estratégico.",
        },
        {
          question: "¿Puedo cambiar de plan después?",
          answer: "Sí — puedes solicitar un cambio de plan escribiéndonos o a través del formulario de esta misma página.",
        },
        {
          question: "¿Necesito que mi sitio haya sido construido por XAYVEN?",
          answer: "Lo ideal es que sí, pero XAYVEN puede evaluar sitios existentes de terceros caso por caso.",
        },
        {
          question: "¿Qué pasa si no tengo ningún plan de mantenimiento?",
          answer:
            "Tu sitio sigue funcionando, pero sin actualizaciones, backups ni soporte activo de XAYVEN — cualquier problema de seguridad, caída o contenido desactualizado queda por tu cuenta.",
        },
        {
          question: "¿El mantenimiento incluye cambios grandes de diseño o funcionalidades nuevas?",
          answer:
            "No — cambios grandes se cotizan aparte, como un proyecto. El mantenimiento cubre continuidad, cambios menores y mejora continua según el plan.",
        },
        {
          question: "¿Cómo empiezo?",
          answer: "Completa el formulario de esta página o cuéntale a XAYVEN AI qué plan te interesa.",
        },
      ],
    },
    aiHelp: {
      heading: "¿Tienes dudas sobre mantenimiento?",
      description: "Cuéntale a XAYVEN AI tu situación y te ayuda a identificar el plan correcto.",
      cta: "Habla con XAYVEN AI",
    },
    form: {
      heading: "Cuéntanos sobre tu web",
      description: "Completa este formulario y te contactamos con los siguientes pasos.",
      name: "Nombre",
      namePlaceholder: "Tu nombre completo",
      email: "Email",
      emailPlaceholder: "tu@email.com",
      company: "Empresa o negocio",
      companyPlaceholder: "Nombre de tu negocio (opcional)",
      website: "URL de tu web",
      websitePlaceholder: "https://tunegocio.com",
      needLabel: "¿Qué necesitas?",
      needOptions: [
        "Actualizar contenido",
        "Corregir un error",
        "Mejorar velocidad",
        "SEO",
        "Seguridad",
        "Añadir una sección",
        "Nueva funcionalidad",
        "Rediseño",
        "Ecommerce",
        "Otro",
      ],
      priorityLabel: "Prioridad",
      priorityOptions: ["Baja — puede esperar", "Media — en las próximas semanas", "Alta — es urgente"],
      message: "Mensaje",
      messagePlaceholder: "Cuéntanos con más detalle qué necesitas.",
      submit: "Enviar solicitud",
      submitting: "Enviando…",
      successTitle: "Solicitud recibida",
      successBody: "Gracias. Revisamos tu solicitud y te contactamos pronto a tu correo.",
      errorTitle: "Algo salió mal",
      errorBody: "No pudimos enviar tu solicitud. Intenta de nuevo o escríbenos directamente.",
      retry: "Intentar de nuevo",
      requiredError: "Este campo es obligatorio.",
      emailError: "Ingresa un correo electrónico válido.",
      urlError: "Ingresa una URL válida (incluye https://).",
      minLengthError: "Cuéntanos un poco más — al menos 10 caracteres.",
    },
  },

  diagnosis: {
    eyebrow: "Diagnóstico",
    heading: "¿Qué necesita realmente tu web?",
    description: "Cinco preguntas rápidas para tener una idea clara de por dónde empezar.",
    startCta: "Empezar diagnóstico",
    stepLabel: "Pregunta",
    backLabel: "Atrás",
    questions: [
      {
        question: "¿Ya tienes una web?",
        options: ["Sí, pero necesita mejoras", "Sí, y funciona bien", "No, todavía no tengo"],
      },
      {
        question: "¿Cuál es tu principal problema?",
        options: [
          "Se ve anticuada",
          "Es lenta",
          "No aparece en Google",
          "No genera contactos o ventas",
          "No tengo ninguna todavía",
        ],
      },
      {
        question: "¿Qué quieres conseguir?",
        options: [
          "Más clientes o ventas",
          "Presencia profesional",
          "Vender productos online",
          "Mejorar lo que ya tengo",
        ],
      },
      {
        question: "¿Qué tipo de negocio tienes?",
        options: [
          "Restaurante",
          "Tienda o comercio",
          "Servicios profesionales",
          "Inmobiliaria",
          "Startup o proyecto digital",
          "Otro",
        ],
      },
      {
        question: "¿Qué tan urgente es?",
        options: ["Quiero empezar ya", "En las próximas semanas", "Todavía explorando"],
      },
    ],
    resultHeading: "Tenemos una idea de por dónde empezar.",
    results: {
      newSite: {
        title: "Nueva web",
        description: "Lo que buscas es empezar de cero: una web propia, pensada para tu negocio desde el día uno.",
      },
      redesign: {
        title: "Rediseño",
        description: "Tu web actual ya no representa a tu negocio. Un rediseño puede darle la seriedad que le falta.",
      },
      cro: {
        title: "Optimización de conversión",
        description: "Tu web recibe visitas pero no las suficientes se convierten en contactos o ventas. Podemos trabajar en eso.",
      },
      ecommerce: {
        title: "Ecommerce",
        description: "Quieres vender tus productos en línea. Necesitas una tienda con catálogo, pedidos y checkout simples.",
      },
      maintenance: {
        title: "Mantenimiento",
        description: "Tu web funciona bien — lo que necesita es que se mantenga así: rápida, segura y actualizada.",
      },
      seoPerformance: {
        title: "SEO y rendimiento",
        description: "El problema no es el diseño, es que tu web es lenta o no aparece en las búsquedas. Podemos mejorar eso.",
      },
      audit: {
        title: "Auditoría",
        description: "Tu situación tiene varias capas. Lo mejor es que revisemos tu caso en detalle antes de recomendarte algo.",
      },
    },
    ctaTalk: "Hablar con XAYVEN",
    ctaContact: "Ir a contacto",
    restart: "Volver a empezar",
  },

  privacy: {
    eyebrow: "Privacidad",
    heading: "Qué datos guardamos y por qué",
    intro:
      "XAYVEN guarda información limitada para poder responder a quienes nos escriben — por el formulario de contacto, el formulario de mantenimiento, o una conversación con XAYVEN AI. Esta página explica qué guardamos, por qué, y qué puedes pedirnos al respecto.",
    sections: [
      {
        heading: "Qué guardamos",
        body: "Los datos que nos compartes voluntariamente en un formulario o en una conversación con XAYVEN AI: nombre, email, empresa, tu web actual, el tipo de proyecto, y el contenido de la conversación. No recopilamos datos de navegación de forma encubierta.",
      },
      {
        heading: "Por qué lo guardamos",
        body: "Para poder responderte, entender qué necesitas y darte seguimiento sin que tengas que repetir todo desde cero. Las conversaciones con XAYVEN AI también nos ayudan a mejorar cómo respondemos.",
      },
      {
        heading: "Consentimiento",
        body: "Al usar el formulario de contacto, el de mantenimiento, o al escribirle a XAYVEN AI, aceptas que guardemos esa información para los fines descritos aquí. Puedes dejar de usar estos canales en cualquier momento.",
      },
      {
        heading: "Eliminación de datos",
        body: "Puedes solicitar que eliminemos tu información escribiéndonos a hello@xayven.com. Atendemos estas solicitudes manualmente mientras XAYVEN construye un proceso automatizado.",
      },
      {
        heading: "Cookies y analítica",
        body: "Usamos una cookie técnica para recordar tu idioma preferido (ES/EN). Todavía no utilizamos herramientas de analítica de terceros; si eso cambia, esta página se actualizará antes de activarlas.",
      },
      {
        heading: "Un aviso honesto",
        body: "Esta página describe una implementación razonable, no una revisión legal formal. Antes de un lanzamiento comercial a mayor escala, XAYVEN revisará esta política con asesoría legal según la jurisdicción correspondiente.",
      },
    ],
    contactNote: "¿Preguntas sobre tus datos? Escríbenos a hello@xayven.com.",
  },

  portal: {
    eyebrow: "Área de proyecto",
    notFoundTitle: "Enlace no válido",
    notFoundBody: "Este enlace de proyecto no existe o ya no está disponible. Si crees que es un error, escríbenos.",
    project: "Proyecto",
    status: "Estado",
    total: "Total",
    paid: "Pagado",
    pending: "Pendiente",
    fullyPaid: "Este proyecto está pagado en su totalidad. ¡Gracias!",
    payDeposit: "Pagar anticipo",
    payBalance: "Pagar saldo",
    payFull: "Pagar completo",
    choosePayment: "¿Qué quieres pagar?",
    chooseProvider: "Elige cómo pagar",
    providerWompi: "Wompi",
    providerWompiHint: "Tarjeta, PSE y más — Colombia",
    providerPaypal: "PayPal",
    providerPaypalHint: "Pago internacional",
    providerWise: "Transferencia bancaria",
    providerWiseHint: "Transferencia internacional (Wise) — confirmación manual",
    providerUnavailable: "No disponible en este momento.",
    providerUnavailableNotConfigured: "Este método de pago todavía no está configurado.",
    providerUnavailableCurrency: "PayPal no admite la moneda de este proyecto — usa Wompi o transferencia bancaria.",
    continueToProvider: "Continuar",
    manualInstructionsTitle: "Instrucciones de transferencia",
    manualPendingNote: "Una vez recibamos tu transferencia, un miembro de XAYVEN la confirmará manualmente. Esto puede tardar 1-2 días hábiles.",
    backToPortal: "Volver al proyecto",
    history: "Historial de pagos",
    historyEmpty: "Todavía no hay pagos registrados.",
    tableDate: "Fecha",
    tableProvider: "Método",
    tableAmount: "Monto",
    tableReference: "Referencia",
    tableStatus: "Estado",
    statusPending: "Pendiente",
    statusApproved: "Aprobado",
    statusDeclined: "Rechazado",
    statusError: "Error",
    statusVoided: "Anulado",
    statusRefunded: "Reembolsado",
    returnHeadingApproved: "¡Pago recibido!",
    returnBodyApproved: "Tu pago fue confirmado correctamente. Te enviamos un correo con los detalles.",
    returnHeadingDeclined: "Pago rechazado",
    returnBodyDeclined: "No pudimos completar tu pago. Puedes intentarlo de nuevo desde tu proyecto.",
    returnHeadingPending: "Estamos confirmando tu pago",
    returnBodyPending: "Esto puede tardar unos minutos. Actualiza esta página en breve o revisa tu proyecto.",
    returnHeadingError: "Algo salió mal",
    returnBodyError: "No pudimos confirmar el estado de tu pago. Si el cargo se realizó, contáctanos con tu referencia.",
    errorAlreadyPaid: "Este proyecto ya está pagado en su totalidad.",
    errorDepositAlreadyPaid: "El anticipo de este proyecto ya fue pagado.",
    errorNoDepositYet: "Primero debes pagar el anticipo.",
    errorPartialPaymentExists: "Ya existe un pago parcial — paga el saldo en lugar del total.",
    errorProviderNotConfigured: "Este método de pago no está disponible en este momento.",
    errorGeneric: "No pudimos iniciar el pago. Intenta de nuevo o contáctanos.",
  },

  paymentTypeLabels: {
    DEPOSIT: "Anticipo",
    BALANCE: "Saldo",
    FULL_PAYMENT: "Pago completo",
    MAINTENANCE: "Mantenimiento",
  },

  auth: {
    login: {
      eyebrow: "Cuenta",
      heading: "Inicia sesión",
      description: "Accede a tu cuenta XAYVEN.",
      panelTagline: "Tu proyecto. Tu espacio. Todo en un solo lugar.",
      emailLabel: "Email",
      emailPlaceholder: "tu@email.com",
      passwordLabel: "Contraseña",
      passwordPlaceholder: "••••••••",
      submit: "Entrar",
      submitting: "Entrando…",
      errorInvalidCredentials: "Email o contraseña incorrectos.",
      errorGeneric: "No pudimos iniciar sesión. Intenta de nuevo.",
      errorRateLimited: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
      noAccount: "¿Todavía no tienes una cuenta?",
      registerLink: "Crear cuenta",
    },
    register: {
      eyebrow: "Cuenta",
      heading: "Crea tu cuenta",
      description: "Empieza a gestionar tu relación con XAYVEN desde un solo lugar.",
      panelTagline: "Un espacio propio para cada proyecto que construyamos juntos.",
      fullNameLabel: "Nombre completo",
      fullNamePlaceholder: "Tu nombre completo",
      emailLabel: "Email",
      emailPlaceholder: "tu@email.com",
      passwordLabel: "Contraseña",
      passwordPlaceholder: "Mínimo 8 caracteres",
      confirmPasswordLabel: "Confirmar contraseña",
      confirmPasswordPlaceholder: "Repite tu contraseña",
      submit: "Crear cuenta",
      submitting: "Creando cuenta…",
      successTitle: "Cuenta creada",
      successBodyActive: "Tu cuenta se creó correctamente. Ya iniciaste sesión.",
      successBodyConfirmEmail: "Tu cuenta se creó correctamente. Revisa tu correo para confirmarla antes de iniciar sesión.",
      goToAccountCta: "Ir a mi cuenta",
      errorEmailInUse: "Ya existe una cuenta con ese email.",
      errorPasswordsDontMatch: "Las contraseñas no coinciden.",
      errorWeakPassword: "La contraseña debe tener al menos 8 caracteres.",
      errorFullNameRequired: "Ingresa tu nombre completo.",
      errorGeneric: "No pudimos crear tu cuenta. Intenta de nuevo.",
      errorRateLimited: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
      haveAccount: "¿Ya tienes una cuenta?",
      loginLink: "Iniciar sesión",
    },
    account: {
      eyebrow: "Cuenta",
      heading: "Tu cuenta",
      greetingPrefix: "Hola,",
      emailLabel: "Email",
      roleLabel: "Rol",
      sessionActiveLabel: "Sesión activa",
      logout: "Cerrar sesión",
    },
    roleLabels: {
      admin: "Administrador",
      staff: "Equipo XAYVEN",
      client: "Cliente",
    },
    panel: {
      projects: "Proyectos",
      conversations: "Conversaciones",
      payments: "Pagos",
    },
  },
};
