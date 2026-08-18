import type { Dictionary } from "../dictionary";

export const en: Dictionary = {
  meta: {
    siteName: "XAYVEN",
    titleTemplate: "%s · XAYVEN",
    defaultTitle: "XAYVEN — Digital design & web development studio",
    defaultDescription:
      "XAYVEN is a digital studio that designs and builds strategic websites for businesses that want an online presence as strong as their brand.",
  },
  nav: {
    home: "Home",
    work: "Work",
    services: "Services",
    process: "Process",
    about: "Studio",
    contact: "Contact",
    maintenance: "Maintenance",
    ctaPrimary: "Start a project",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    languageSwitcherLabel: "Switch language",
    loginCta: "Sign in",
    accountCta: "My account",
  },
  hero: {
    eyebrow: "XAYVEN — Digital Studio",
    headline: "Your business deserves a website that",
    headlineAccent: "closes deals, not loses them.",
    subheadline:
      "We design and build strategic websites for businesses that want to look — and work — like the best version of themselves.",
    ctaPrimary: "Start a project",
    ctaSecondary: "View our work",
    visualCaption: "Strategy, design and development under one team.",
    pillars: {
      strategy: "Strategy",
      design: "Design",
      development: "Development",
    },
  },
  trust: {
    heading: "How we work, in short",
    items: [
      {
        title: "Built to measure",
        description: "Every project is built from scratch. No generic templates.",
      },
      {
        title: "Code we own",
        description: "Clean, fast development, built to grow alongside your business.",
      },
      {
        title: "Built for conversion",
        description: "Every section of your site has a purpose: turning visits into clients.",
      },
      {
        title: "Bilingual from day one",
        description: "Your site ready to speak to more clients, in Spanish and English.",
      },
    ],
  },
  services: {
    eyebrow: "Services",
    heading: "What we build",
    description:
      "We don't sell hours of code. We sell strategy, design and development working together to get you results.",
    ctaLabel: "See all services",
    // Services Phase 10 (QA/dead-code cleanup) — `items`/`fieldLabels`
    // (legacy content for 5 services different from the real ones)
    // removed: since Services Phase 6, XAYVEN AI also reads
    // servicesStore.ts — these were left with zero real consumers,
    // confirmed by exhaustive grep before removal. Each service's real
    // content lives in servicesStore.ts.
    viewService: "View service",
    priceFrom: "From",
    priceQuote: "Custom quote",
    aiHelp: {
      heading: "Not sure which service you need?",
      description: "Tell XAYVEN AI about your situation and it'll help you identify the right service.",
      cta: "Talk to XAYVEN AI",
    },
  },
  why: {
    eyebrow: "Why XAYVEN",
    heading: "One team, one point of view",
    description:
      "Most websites fail because design, development and strategy get handled by separate teams that don't talk to each other. We work differently.",
    items: [
      {
        title: "Original design, no templates",
        description: "Every project is built from scratch, made for your brand and your business.",
      },
      {
        title: "Clean, fast code",
        description: "Sites optimized for speed and search engines from day one.",
      },
      {
        title: "A clear process",
        description: "You know what to expect at every stage of the project — no last-minute surprises.",
      },
      {
        title: "Bilingual from the ground up",
        description: "Spanish and English built into the architecture, not translated on top.",
      },
      {
        title: "Strategy, design and development together",
        description: "One team thinks through the business, the design and the build.",
      },
      {
        title: "Direct communication",
        description: "You talk to the people building your project, not a sales layer.",
      },
    ],
  },
  // Services Phase 3 — /services/[slug]. Generic UI copy/section labels
  // shared across every service detail page; the actual editorial
  // content (heading, definition, problem, solution, includes, forWhom,
  // useCases, faq) lives per-service in servicesStore.ts, never here.
  serviceDetail: {
    definitionHeading: "What is it?",
    problemHeading: "The problem",
    solutionHeading: "The XAYVEN approach",
    includesHeading: "What's included",
    forWhomHeading: "Who it's for",
    idealIfLabel: "Ideal if...",
    notIdealIfLabel: "May not be the right fit if...",
    useCasesHeading: "Use cases",
    workLinkLabel: "See real projects",
    pricingHeading: "Pricing",
    priceQuoteExplanation: "This service doesn't have a closed package — it's quoted based on your project's real scope.",
    processHeading: "How we work",
    processDescription: "The same process for every XAYVEN service — design, development and strategy under one team.",
    processLinkLabel: "See the full process",
    faqHeading: "Frequently asked questions",
    faqDescription: "What we get asked most about this service.",
    relatedHeading: "Other services",
    choosePackageLabel: "Choose this package",
    // SEO/AEO/GEO Phase 8 — explicit internal linking (master prompt
    // §39): Maintenance and Diagnosis, neither linked from the service
    // detail page until this phase.
    exploreMoreHeading: "Explore more",
    maintenanceLinkLabel: "Already have a website? See Maintenance",
    diagnosisLinkLabel: "Not sure what you need? Take the diagnosis",
  },
  work: {
    eyebrow: "Selected work",
    heading: "Projects we've built",
    description:
      "One real project, and conceptual explorations that show how we approach design for different types of businesses.",
    ctaLabel: "View all work",
    conceptBadge: "Concept project",
    realBadge: "Real project",
    viewCase: "View full case",
    backToWork: "Back to work",
    fields: {
      problem: "Problem",
      goal: "Goal",
      solution: "Solution",
      design: "Design",
      tech: "Technology",
      result: "Result",
    },
    empty: "No projects in this category yet.",
    nextProject: "Next project",
  },
  process: {
    eyebrow: "Process",
    heading: "How we work",
    description: "A clear process, designed to reduce uncertainty — you know what's next at every stage.",
    steps: [
      {
        number: "01",
        title: "Discover",
        description: "We get to know your business: who you sell to, what sets you apart, and what your site actually needs.",
      },
      {
        number: "02",
        title: "Strategize",
        description: "We define goals, site structure and the experience each visitor will have.",
      },
      {
        number: "03",
        title: "Design",
        description: "We create the visual identity and user experience, built for your brand and your audience.",
      },
      {
        number: "04",
        title: "Build",
        description: "We build the site with code we own, with care for performance, accessibility and detail.",
      },
      {
        number: "05",
        title: "Launch",
        description: "We test, optimize and publish. Your site goes live ready to receive visitors.",
      },
      {
        number: "06",
        title: "Evolve",
        description: "We keep improving the site when your business needs it — we don't disappear after launch.",
      },
    ],
  },
  capabilities: {
    eyebrow: "Who we work with",
    heading: "We build for every kind of business",
    description:
      "XAYVEN isn't limited to tech companies. We design and build for businesses in any sector that want a serious digital presence.",
    items: [
      "Restaurants",
      "Local shops",
      "Local businesses",
      "Independent professionals",
      "Real estate",
      "Ecommerce",
      "Companies",
      "Personal brands",
      "Startups",
      "Service businesses",
      "Digital projects",
    ],
  },
  trustBuilding: {
    eyebrow: "Trust",
    heading: "We're a new studio. Here's how we make up for it.",
    description:
      "XAYVEN is just starting out as a brand — we'd rather be upfront about that than invent numbers or clients that don't exist. Here's how we work while we build our track record.",
    items: [
      {
        title: "Quality in every detail",
        description: "We treat the design and the code like it's our own business.",
      },
      {
        title: "Real projects, shown as they are",
        description: "You will never see invented clients, numbers or results on this site.",
      },
      {
        title: "A transparent process",
        description: "You always know what stage your project is at, and what's next.",
      },
      {
        title: "Direct attention",
        description: "You talk to the people designing and building your project, not a salesperson.",
      },
    ],
  },
  faq: {
    eyebrow: "FAQ",
    heading: "Before you ask",
    description: "The most common questions from people about to start a project with us.",
    items: [
      {
        question: "How much does a website with XAYVEN cost?",
        answer:
          "It depends on the scope: a landing page and a full online store aren't the same project. Once we understand your business, we give you a clear quote — not a generic number upfront.",
      },
      {
        question: "How long does it take to build my site?",
        answer:
          "It varies with complexity. A landing page can take days; a full site or online store, a few weeks. During discovery we give you a concrete timeframe.",
      },
      {
        question: "Do I need to have my copy and photos ready before we start?",
        answer:
          "Not necessarily. We can help with that part, though your own content always helps the result feel more authentic to your brand.",
      },
      {
        question: "Do you work with businesses that aren't in tech?",
        answer:
          "Yes — most of the projects we care about are local businesses, professionals and brands that aren't tech at all: restaurants, shops, real estate, services.",
      },
      {
        question: "Can I request changes after the site is live?",
        answer: "Yes. We offer ongoing maintenance and optimization for the sites we build, so they keep working well over time.",
      },
      {
        question: "Can my site be in both Spanish and English?",
        answer:
          "Yes. If your business needs it, we can build your site bilingual from the start, with the architecture ready for more languages later.",
      },
      {
        question: "What do you need from me to get started?",
        answer:
          "Fill out the contact form telling us about your business and what you're looking for. From there we set up an initial conversation to understand the project.",
      },
    ],
  },
  finalCta: {
    heading: "Ready for a website that matches your business?",
    description: "Tell us what you need. We'll reply with a concrete proposal, not a generic \"get in touch\".",
    ctaPrimary: "Start a project",
    ctaSecondary: "View our work",
  },
  about: {
    eyebrow: "The studio",
    heading: "A digital studio, not a page factory",
    intro:
      "XAYVEN is a digital studio focused on web design and development for businesses that want a professional digital presence. We combine strategy, design and development under one team, so every project has a single vision from start to finish.",
    approachHeading: "How we approach the work",
    approach:
      "We believe a good website should be simple to understand and hard to forget. We prioritize clarity over decoration, and conversion over visual effects that don't add anything. If an animation doesn't improve the experience, we cut it. If a section doesn't have a clear purpose, it doesn't belong on your site either.",
    valuesHeading: "What you won't find here",
    values: [
      "Invented clients or testimonials.",
      "Growth statistics or numbers with no basis.",
      "Generic templates reused across projects.",
      "Promises of results we can't guarantee.",
    ],
  },
  contact: {
    eyebrow: "Contact",
    heading: "Let's start your project",
    description:
      "Tell us about your business and what you need. We read every message and reply with concrete information, not a generic auto-response.",
    directHeading: "Direct contact",
    directEmail: "hello@xayven.com",
    directNote: "We reply within 1–2 business days.",
    form: {
      name: "Name",
      namePlaceholder: "Your full name",
      email: "Email",
      emailPlaceholder: "you@email.com",
      company: "Company / business",
      companyPlaceholder: "Your business name (optional)",
      projectType: "Project type",
      projectTypeOptions: [
        "New website",
        "Redesign of an existing site",
        "Online store",
        "Landing page",
        "Brand identity",
        "Other",
      ],
      budget: "Approximate budget",
      budgetOptions: [
        "Under $250 USD",
        "$250 – $750 USD",
        "$750 – $1,500 USD",
        "Over $1,500 USD",
        "Not sure yet",
      ],
      message: "Tell us about your project",
      messagePlaceholder: "What do you need? What problem are you trying to solve with your website?",
      submit: "Send message",
      submitting: "Sending…",
      successTitle: "Message received",
      successBody: "Thanks for reaching out. We'll review your message and get back to you by email soon.",
      errorTitle: "Something went wrong",
      errorBody: "We couldn't send your message. Try again or email us directly.",
      retry: "Try again",
      requiredError: "This field is required.",
      emailError: "Enter a valid email address.",
      minLengthError: "Tell us a bit more — at least 20 characters.",
      selectedPlanLabel: "Selected plan",
      changePlanLabel: "Remove",
    },
  },
  footer: {
    tagline: "Digital design and web development studio.",
    navHeading: "Navigation",
    contactHeading: "Contact",
    languageHeading: "Language",
    rights: "All rights reserved.",
    builtWith: "Designed and built by XAYVEN.",
  },
  notFound: {
    eyebrow: "404",
    heading: "This page doesn't exist",
    description: "The link might be broken, or the page may have moved.",
    cta: "Back to home",
  },
  pages: {
    work: {
      title: "Work",
      description: "Real projects and conceptual explorations from XAYVEN — web design and development for different kinds of businesses.",
    },
    services: {
      title: "Services",
      description: "Web design, development, ecommerce, landing pages, digital identity and SEO. Services from XAYVEN, digital studio.",
    },
    process: {
      title: "Process",
      description: "How XAYVEN works, start to finish: discover, strategize, design, build, launch and evolve.",
    },
    about: {
      title: "Studio",
      description: "Who we are and how we approach web design and development at XAYVEN.",
    },
    contact: {
      title: "Contact",
      description: "Start your project with XAYVEN. Tell us about your business and we'll reply with a concrete proposal.",
    },
    maintenance: {
      title: "Maintenance",
      description: "XAYVEN web maintenance plans: speed, security and updates so your site keeps working well.",
    },
    diagnosis: {
      title: "Website diagnosis",
      description: "Answer 5 questions and find out what your website actually needs.",
    },
    privacy: {
      title: "Privacy",
      description: "What data XAYVEN stores, why, and how you can request that we delete it.",
    },
  },
  skipToContent: "Skip to content",

  pricing: {
    displayCurrencyLabel: "Show prices in",
  },

  ai: {
    name: "XAYVEN AI",
    greeting:
      "Hi. I'm XAYVEN's assistant.\nI can walk you through our services, maintenance, projects and process. If you want, I can also help you figure out what your website needs.",
    suggestions: [
      "I want to build a website",
      "I already have a website",
      "I need maintenance",
      "How much does a website cost?",
      "I want to talk to XAYVEN",
    ],
    inputPlaceholder: "Type your message…",
    sendLabel: "Send",
    openLabel: "Open XAYVEN AI",
    closeLabel: "Close XAYVEN AI",
    availability: "Online",
    thinking: "XAYVEN AI is typing…",
    notConfiguredTitle: "XAYVEN AI isn't active yet",
    notConfiguredBody:
      "This feature is being set up. In the meantime, you can reach us through the contact form or WhatsApp.",
    errorBody: "We couldn't send your message. Please try again in a moment.",
    rateLimitedBody: "You're going a bit fast — wait a few seconds before sending another message.",
    consentNotice: "Your conversation may be stored so XAYVEN can follow up with you. See our ",
    consentPrivacyLink: "privacy policy",
    restart: "New conversation",
  },

  whatsapp: {
    label: "Chat on WhatsApp",
    defaultMessage: "Hi XAYVEN, I'm interested in learning more about your services.",
    maintenanceMessage: "Hi XAYVEN, I'm interested in maintenance for my website.",
  },

  maintenance: {
    eyebrow: "Maintenance",
    heading: "Your website doesn't end when we launch it.",
    description: "We keep it fast, secure and up to date so you can focus on your business.",
    // Services/Maintenance Phase 4 — `slug` references pricing_catalog
    // (same "slug is the stable reference" principle already used by
    // Services). `priceLabel` removed from here — the real price is
    // resolved in the page against Pricing Core, never hardcoded.
    plans: [
      {
        slug: "essential",
        name: "Essential",
        tagline: "The basics, well taken care of.",
        who: "For live sites that need to keep running without surprises.",
      },
      {
        slug: "growth",
        name: "Growth",
        tagline: "Maintenance with continuous improvement.",
        who: "For businesses that want their site to keep improving, not just stay standing.",
      },
      {
        slug: "care-plus",
        name: "Care+",
        tagline: "Close, hands-on support.",
        who: "For businesses that want a technical team on call, without hiring one.",
      },
    ],
    perMonthSuffix: "/mo",
    priceUnavailable: "Get a quote",
    ctaLabel: "Request maintenance",
    about: {
      whatHeading: "What is XAYVEN Maintenance?",
      whatBody:
        "It's the ongoing maintenance service for sites already built by XAYVEN (or adopted by XAYVEN): hosting, security, updates and support so the site keeps working without you having to think about it.",
      whyHeading: "Why does it exist?",
      whyBody:
        "A website doesn't end the day it launches — it needs updates, backups, monitoring and constant adjustments. XAYVEN Maintenance exists so that responsibility never falls on you.",
      problemsHeading: "What problems it solves",
      problems: [
        "Abandoned sites that stop receiving security updates.",
        "Nobody answers when something breaks or the site goes down.",
        "Outdated content because there's no simple way to request changes.",
        "Zero visibility into how the site is actually performing.",
      ],
    },
    comparisonHeading: "Plan comparison",
    comparisonNote: "All three plans share Essential's base — Growth and Care+ add capacity and priority, they don't replace it.",
    comparisonPriceRow: "Price",
    comparisonWhoRow: "Who it's for",
    comparisonIncludesRow: "Includes",
    faq: {
      eyebrow: "Maintenance",
      heading: "Frequently asked questions",
      description: "What we get asked most about the maintenance plans.",
      items: [
        {
          question: "What's the difference between Essential, Growth and Care+?",
          answer:
            "Essential keeps your site running (updates, monitoring, backups, email support). Growth adds regular content changes, optimization and a recurring SEO review. Care+ adds priority response, small new sections and strategic check-ins.",
        },
        {
          question: "Can I change plans later?",
          answer: "Yes — you can request a plan change by messaging us or through the form on this same page.",
        },
        {
          question: "Does my site need to have been built by XAYVEN?",
          answer: "Ideally yes, but XAYVEN can evaluate existing third-party sites case by case.",
        },
        {
          question: "What happens if I don't have any maintenance plan?",
          answer:
            "Your site keeps running, but without updates, backups or active XAYVEN support — any security issue, downtime or outdated content is on you.",
        },
        {
          question: "Does maintenance include large redesigns or new features?",
          answer:
            "No — large changes are quoted separately, as a project. Maintenance covers continuity, minor changes and ongoing improvement depending on the plan.",
        },
        {
          question: "How do I get started?",
          answer: "Fill out the form on this page or tell XAYVEN AI which plan you're interested in.",
        },
      ],
    },
    aiHelp: {
      heading: "Have questions about maintenance?",
      description: "Tell XAYVEN AI about your situation and it'll help you identify the right plan.",
      cta: "Talk to XAYVEN AI",
    },
    form: {
      heading: "Tell us about your website",
      description: "Fill out this form and we'll reach out with next steps.",
      name: "Name",
      namePlaceholder: "Your full name",
      email: "Email",
      emailPlaceholder: "you@email.com",
      company: "Company / business",
      companyPlaceholder: "Your business name (optional)",
      website: "Your website URL",
      websitePlaceholder: "https://yourbusiness.com",
      needLabel: "What do you need?",
      needOptions: [
        "Update content",
        "Fix a bug",
        "Improve speed",
        "SEO",
        "Security",
        "Add a section",
        "New feature",
        "Redesign",
        "Ecommerce",
        "Other",
      ],
      priorityLabel: "Priority",
      priorityOptions: ["Low — can wait", "Medium — in the coming weeks", "High — it's urgent"],
      message: "Message",
      messagePlaceholder: "Tell us in more detail what you need.",
      submit: "Send request",
      submitting: "Sending…",
      successTitle: "Request received",
      successBody: "Thanks. We'll review your request and reach out to your email soon.",
      errorTitle: "Something went wrong",
      errorBody: "We couldn't send your request. Try again or email us directly.",
      retry: "Try again",
      requiredError: "This field is required.",
      emailError: "Enter a valid email address.",
      urlError: "Enter a valid URL (include https://).",
      minLengthError: "Tell us a bit more — at least 10 characters.",
    },
  },

  diagnosis: {
    eyebrow: "Diagnosis",
    heading: "What does your website actually need?",
    description: "Five quick questions to get a clear idea of where to start.",
    startCta: "Start diagnosis",
    stepLabel: "Question",
    backLabel: "Back",
    questions: [
      {
        question: "Do you already have a website?",
        options: ["Yes, but it needs improvement", "Yes, and it works well", "No, not yet"],
      },
      {
        question: "What's your main problem?",
        options: [
          "It looks outdated",
          "It's slow",
          "It doesn't show up on Google",
          "It doesn't generate leads or sales",
          "I don't have one yet",
        ],
      },
      {
        question: "What do you want to achieve?",
        options: [
          "More clients or sales",
          "A professional presence",
          "Sell products online",
          "Improve what I already have",
        ],
      },
      {
        question: "What type of business do you have?",
        options: [
          "Restaurant",
          "Shop or retail",
          "Professional services",
          "Real estate",
          "Startup or digital project",
          "Other",
        ],
      },
      {
        question: "How urgent is it?",
        options: ["I want to start now", "In the coming weeks", "Still exploring"],
      },
    ],
    resultHeading: "We have an idea of where to start.",
    results: {
      newSite: {
        title: "New website",
        description: "You're looking to start from scratch: your own site, built for your business from day one.",
      },
      redesign: {
        title: "Redesign",
        description: "Your current site no longer represents your business. A redesign can give it the seriousness it's missing.",
      },
      cro: {
        title: "Conversion optimization",
        description: "Your site gets visits, but not enough turn into leads or sales. We can work on that.",
      },
      ecommerce: {
        title: "Ecommerce",
        description: "You want to sell your products online. You need a store with a simple catalog, orders and checkout.",
      },
      maintenance: {
        title: "Maintenance",
        description: "Your site works well — what it needs is to stay that way: fast, secure and up to date.",
      },
      seoPerformance: {
        title: "SEO & performance",
        description: "The problem isn't the design — your site is slow or doesn't show up in search. We can improve that.",
      },
      audit: {
        title: "Audit",
        description: "Your situation has a few layers to it. It's best if we look at your case in detail before recommending anything.",
      },
    },
    ctaTalk: "Talk to XAYVEN",
    ctaContact: "Go to contact",
    restart: "Start over",
  },

  privacy: {
    eyebrow: "Privacy",
    heading: "What data we store, and why",
    intro:
      "XAYVEN stores limited information so we can respond to the people who write to us — through the contact form, the maintenance form, or a conversation with XAYVEN AI. This page explains what we store, why, and what you can ask us about it.",
    sections: [
      {
        heading: "What we store",
        body: "The data you voluntarily share in a form or in a conversation with XAYVEN AI: name, email, company, your current website, project type, and the content of the conversation. We don't covertly collect browsing data.",
      },
      {
        heading: "Why we store it",
        body: "So we can respond to you, understand what you need, and follow up without you having to repeat everything from scratch. Conversations with XAYVEN AI also help us improve how we respond.",
      },
      {
        heading: "Consent",
        body: "By using the contact form, the maintenance form, or writing to XAYVEN AI, you agree that we store that information for the purposes described here. You can stop using these channels at any time.",
      },
      {
        heading: "Data deletion",
        body: "You can request that we delete your information by emailing hello@xayven.com. We handle these requests manually while XAYVEN builds an automated process.",
      },
      {
        heading: "Cookies & analytics",
        body: "We use one technical cookie to remember your preferred language (ES/EN). We don't yet use third-party analytics tools; if that changes, this page will be updated before they're turned on.",
      },
      {
        heading: "An honest note",
        body: "This page describes a reasonable implementation, not a formal legal review. Before a larger-scale commercial launch, XAYVEN will review this policy with legal counsel for the relevant jurisdiction.",
      },
    ],
    contactNote: "Questions about your data? Email us at hello@xayven.com.",
  },

  portal: {
    eyebrow: "Project area",
    notFoundTitle: "Invalid link",
    notFoundBody: "This project link doesn't exist or is no longer available. If you think this is a mistake, reach out to us.",
    project: "Project",
    status: "Status",
    total: "Total",
    paid: "Paid",
    pending: "Pending",
    fullyPaid: "This project is fully paid. Thank you!",
    payDeposit: "Pay deposit",
    payBalance: "Pay balance",
    payFull: "Pay in full",
    choosePayment: "What would you like to pay?",
    chooseProvider: "Choose how to pay",
    providerWompi: "Wompi",
    providerWompiHint: "Card, PSE and more — Colombia",
    providerPaypal: "PayPal",
    providerPaypalHint: "International payment",
    providerWise: "Bank transfer",
    providerWiseHint: "International transfer (Wise) — manually confirmed",
    providerUnavailable: "Not available right now.",
    providerUnavailableNotConfigured: "This payment method isn't configured yet.",
    providerUnavailableCurrency: "PayPal doesn't support this project's currency — use Wompi or a bank transfer instead.",
    continueToProvider: "Continue",
    manualInstructionsTitle: "Transfer instructions",
    manualPendingNote: "Once we receive your transfer, someone from XAYVEN will confirm it manually. This can take 1-2 business days.",
    backToPortal: "Back to project",
    history: "Payment history",
    historyEmpty: "No payments recorded yet.",
    tableDate: "Date",
    tableProvider: "Method",
    tableAmount: "Amount",
    tableReference: "Reference",
    tableStatus: "Status",
    statusPending: "Pending",
    statusApproved: "Approved",
    statusDeclined: "Declined",
    statusError: "Error",
    statusVoided: "Voided",
    statusRefunded: "Refunded",
    returnHeadingApproved: "Payment received!",
    returnBodyApproved: "Your payment was confirmed successfully. We've emailed you the details.",
    returnHeadingDeclined: "Payment declined",
    returnBodyDeclined: "We couldn't complete your payment. You can try again from your project.",
    returnHeadingPending: "Confirming your payment",
    returnBodyPending: "This can take a few minutes. Refresh this page shortly or check your project.",
    returnHeadingError: "Something went wrong",
    returnBodyError: "We couldn't confirm your payment status. If you were charged, contact us with your reference.",
    errorAlreadyPaid: "This project is already fully paid.",
    errorDepositAlreadyPaid: "This project's deposit has already been paid.",
    errorNoDepositYet: "You need to pay the deposit first.",
    errorPartialPaymentExists: "A partial payment already exists — pay the balance instead of the full amount.",
    errorProviderNotConfigured: "This payment method isn't available right now.",
    errorGeneric: "We couldn't start the payment. Try again or contact us.",
  },

  paymentTypeLabels: {
    DEPOSIT: "Deposit",
    BALANCE: "Balance",
    FULL_PAYMENT: "Full payment",
    MAINTENANCE: "Maintenance",
  },

  auth: {
    login: {
      eyebrow: "Account",
      heading: "Sign in",
      description: "Access your XAYVEN account.",
      panelTagline: "Your project. Your space. All in one place.",
      emailLabel: "Email",
      emailPlaceholder: "you@email.com",
      passwordLabel: "Password",
      passwordPlaceholder: "••••••••",
      submit: "Sign in",
      submitting: "Signing in…",
      errorInvalidCredentials: "Incorrect email or password.",
      errorGeneric: "We couldn't sign you in. Try again.",
      errorRateLimited: "Too many attempts. Wait a few minutes and try again.",
      noAccount: "Don't have an account yet?",
      registerLink: "Create account",
    },
    register: {
      eyebrow: "Account",
      heading: "Create your account",
      description: "Start managing your relationship with XAYVEN from one place.",
      panelTagline: "A dedicated space for every project we build together.",
      fullNameLabel: "Full name",
      fullNamePlaceholder: "Your full name",
      emailLabel: "Email",
      emailPlaceholder: "you@email.com",
      passwordLabel: "Password",
      passwordPlaceholder: "At least 8 characters",
      confirmPasswordLabel: "Confirm password",
      confirmPasswordPlaceholder: "Repeat your password",
      submit: "Create account",
      submitting: "Creating account…",
      successTitle: "Account created",
      successBodyActive: "Your account was created successfully. You're signed in.",
      successBodyConfirmEmail: "Your account was created successfully. Check your email to confirm it before signing in.",
      goToAccountCta: "Go to my account",
      errorEmailInUse: "An account with that email already exists.",
      errorPasswordsDontMatch: "Passwords don't match.",
      errorWeakPassword: "Password must be at least 8 characters.",
      errorFullNameRequired: "Enter your full name.",
      errorGeneric: "We couldn't create your account. Try again.",
      errorRateLimited: "Too many attempts. Wait a few minutes and try again.",
      haveAccount: "Already have an account?",
      loginLink: "Sign in",
    },
    account: {
      eyebrow: "Account",
      heading: "Your account",
      greetingPrefix: "Hi,",
      emailLabel: "Email",
      roleLabel: "Role",
      sessionActiveLabel: "Active session",
      logout: "Sign out",
    },
    roleLabels: {
      admin: "Administrator",
      staff: "XAYVEN team",
      client: "Client",
    },
    panel: {
      projects: "Projects",
      conversations: "Conversations",
      payments: "Payments",
    },
  },
};
