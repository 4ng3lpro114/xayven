/**
 * Shape of a locale dictionary. Every locale in `src/lib/i18n/dictionaries`
 * must satisfy this type, which keeps translations from silently drifting
 * out of sync as the site grows.
 */
export interface Dictionary {
  meta: {
    siteName: string;
    titleTemplate: string;
    defaultTitle: string;
    defaultDescription: string;
  };
  nav: {
    home: string;
    work: string;
    services: string;
    process: string;
    about: string;
    contact: string;
    maintenance: string;
    ctaPrimary: string;
    openMenu: string;
    closeMenu: string;
    languageSwitcherLabel: string;
    /** Header/mobile-nav auth access — shown instead of each other
     *  depending on session state (see [locale]/layout.tsx). */
    loginCta: string;
    accountCta: string;
  };
  hero: {
    eyebrow: string;
    headline: string;
    headlineAccent: string;
    subheadline: string;
    ctaPrimary: string;
    ctaSecondary: string;
    visualCaption: string;
    /** Short one-word labels for the HeroVisual "pillars" composition —
     *  deliberately separate from process.steps so the Hero never changes
     *  accidentally if that page's copy changes for unrelated reasons. */
    pillars: {
      strategy: string;
      design: string;
      development: string;
    };
  };
  trust: {
    heading: string;
    items: { title: string; description: string }[];
  };
  services: {
    eyebrow: string;
    heading: string;
    description: string;
    ctaLabel: string;
    /** Services Phase 2 — generic UI copy for the /services index, not
     *  editorial content (that lives per-service in servicesStore.ts). */
    viewService: string;
    priceFrom: string;
    priceQuote: string;
    aiHelp: {
      heading: string;
      description: string;
      cta: string;
    };
  };
  why: {
    eyebrow: string;
    heading: string;
    description: string;
    items: { title: string; description: string }[];
  };
  /** Services Phase 3 — /services/[slug] generic UI copy. Editorial
   *  content per service lives in servicesStore.ts, not here. */
  serviceDetail: {
    definitionHeading: string;
    problemHeading: string;
    solutionHeading: string;
    includesHeading: string;
    forWhomHeading: string;
    idealIfLabel: string;
    notIdealIfLabel: string;
    useCasesHeading: string;
    workLinkLabel: string;
    pricingHeading: string;
    priceQuoteExplanation: string;
    processHeading: string;
    processDescription: string;
    processLinkLabel: string;
    faqHeading: string;
    faqDescription: string;
    relatedHeading: string;
    choosePackageLabel: string;
    exploreMoreHeading: string;
    maintenanceLinkLabel: string;
    diagnosisLinkLabel: string;
  };
  work: {
    eyebrow: string;
    heading: string;
    description: string;
    ctaLabel: string;
    conceptBadge: string;
    realBadge: string;
    viewCase: string;
    backToWork: string;
    fields: {
      problem: string;
      goal: string;
      solution: string;
      design: string;
      tech: string;
      result: string;
    };
    empty: string;
    nextProject: string;
  };
  process: {
    eyebrow: string;
    heading: string;
    description: string;
    steps: { number: string; title: string; description: string }[];
  };
  capabilities: {
    eyebrow: string;
    heading: string;
    description: string;
    items: string[];
  };
  trustBuilding: {
    eyebrow: string;
    heading: string;
    description: string;
    items: { title: string; description: string }[];
  };
  faq: {
    eyebrow: string;
    heading: string;
    description: string;
    items: { question: string; answer: string }[];
  };
  finalCta: {
    heading: string;
    description: string;
    ctaPrimary: string;
    ctaSecondary: string;
  };
  about: {
    eyebrow: string;
    heading: string;
    intro: string;
    approachHeading: string;
    approach: string;
    valuesHeading: string;
    values: string[];
  };
  contact: {
    eyebrow: string;
    heading: string;
    description: string;
    directHeading: string;
    directEmail: string;
    directNote: string;
    form: {
      name: string;
      namePlaceholder: string;
      email: string;
      emailPlaceholder: string;
      company: string;
      companyPlaceholder: string;
      projectType: string;
      projectTypeOptions: string[];
      budget: string;
      budgetOptions: string[];
      message: string;
      messagePlaceholder: string;
      submit: string;
      submitting: string;
      successTitle: string;
      successBody: string;
      errorTitle: string;
      errorBody: string;
      retry: string;
      requiredError: string;
      emailError: string;
      minLengthError: string;
      selectedPlanLabel: string;
      changePlanLabel: string;
    };
  };
  footer: {
    tagline: string;
    navHeading: string;
    contactHeading: string;
    languageHeading: string;
    rights: string;
    builtWith: string;
  };
  notFound: {
    eyebrow: string;
    heading: string;
    description: string;
    cta: string;
  };
  pages: {
    work: { title: string; description: string };
    services: { title: string; description: string };
    process: { title: string; description: string };
    about: { title: string; description: string };
    contact: { title: string; description: string };
    maintenance: { title: string; description: string };
    diagnosis: { title: string; description: string };
    privacy: { title: string; description: string };
  };
  skipToContent: string;

  /** International Pricing Phase D — Display Currency. Generic UI copy
   *  for the display-currency selector shown next to public prices
   *  (Services/Maintenance) — never per-page content. */
  pricing: {
    displayCurrencyLabel: string;
  };

  ai: {
    name: string;
    greeting: string;
    suggestions: string[];
    inputPlaceholder: string;
    sendLabel: string;
    openLabel: string;
    closeLabel: string;
    availability: string;
    thinking: string;
    notConfiguredTitle: string;
    notConfiguredBody: string;
    errorBody: string;
    rateLimitedBody: string;
    consentNotice: string;
    consentPrivacyLink: string;
    restart: string;
  };

  whatsapp: {
    label: string;
    defaultMessage: string;
    maintenanceMessage: string;
  };

  maintenance: {
    eyebrow: string;
    heading: string;
    description: string;
    /** Maintenance Phase 4 — `slug` references pricing_catalog (real
     *  price resolved in the page, never stored here). Editorial content
     *  (name/tagline/who/features) still lives in the dictionary — Essential/
     *  Growth/Care+ are only 3 fixed plans, not a whole new domain model
     *  like Services got. */
    /** Pre-Production Correction R1 — `features` removed from here.
     *  Single source of truth is now pricing_catalog.features_es/
     *  features_en (see PricingCatalogItem.features in pricing/types.ts) —
     *  editorial fields (tagline/who) stay here, commercial ones don't. */
    plans: {
      slug: string;
      name: string;
      tagline: string;
      who: string;
    }[];
    perMonthSuffix: string;
    /** Fallback only — shown if a plan's slug somehow doesn't resolve to
     *  an active Pricing Core item. Never the normal path. */
    priceUnavailable: string;
    ctaLabel: string;
    about: {
      whatHeading: string;
      whatBody: string;
      whyHeading: string;
      whyBody: string;
      problemsHeading: string;
      problems: string[];
    };
    comparisonHeading: string;
    comparisonNote: string;
    comparisonPriceRow: string;
    comparisonWhoRow: string;
    comparisonIncludesRow: string;
    faq: {
      eyebrow: string;
      heading: string;
      description: string;
      items: { question: string; answer: string }[];
    };
    aiHelp: {
      heading: string;
      description: string;
      cta: string;
    };
    form: {
      heading: string;
      description: string;
      name: string;
      namePlaceholder: string;
      email: string;
      emailPlaceholder: string;
      company: string;
      companyPlaceholder: string;
      website: string;
      websitePlaceholder: string;
      needLabel: string;
      needOptions: string[];
      priorityLabel: string;
      priorityOptions: string[];
      message: string;
      messagePlaceholder: string;
      submit: string;
      submitting: string;
      successTitle: string;
      successBody: string;
      errorTitle: string;
      errorBody: string;
      retry: string;
      requiredError: string;
      emailError: string;
      urlError: string;
      minLengthError: string;
    };
  };

  diagnosis: {
    eyebrow: string;
    heading: string;
    description: string;
    startCta: string;
    stepLabel: string;
    backLabel: string;
    questions: { question: string; options: string[] }[];
    resultHeading: string;
    results: Record<
      "newSite" | "redesign" | "cro" | "ecommerce" | "maintenance" | "seoPerformance" | "audit",
      { title: string; description: string }
    >;
    ctaTalk: string;
    ctaContact: string;
    restart: string;
  };

  privacy: {
    eyebrow: string;
    heading: string;
    intro: string;
    sections: { heading: string; body: string }[];
    contactNote: string;
  };

  portal: {
    eyebrow: string;
    notFoundTitle: string;
    notFoundBody: string;
    project: string;
    status: string;
    total: string;
    paid: string;
    pending: string;
    fullyPaid: string;
    payDeposit: string;
    payBalance: string;
    payFull: string;
    choosePayment: string;
    chooseProvider: string;
    providerWompi: string;
    providerWompiHint: string;
    providerPaypal: string;
    providerPaypalHint: string;
    providerWise: string;
    providerWiseHint: string;
    providerUnavailable: string;
    providerUnavailableNotConfigured: string;
    providerUnavailableCurrency: string;
    continueToProvider: string;
    manualInstructionsTitle: string;
    manualPendingNote: string;
    backToPortal: string;
    history: string;
    historyEmpty: string;
    tableDate: string;
    tableProvider: string;
    tableAmount: string;
    tableReference: string;
    tableStatus: string;
    statusPending: string;
    statusApproved: string;
    statusDeclined: string;
    statusError: string;
    statusVoided: string;
    statusRefunded: string;
    returnHeadingApproved: string;
    returnBodyApproved: string;
    returnHeadingDeclined: string;
    returnBodyDeclined: string;
    returnHeadingPending: string;
    returnBodyPending: string;
    returnHeadingError: string;
    returnBodyError: string;
    errorAlreadyPaid: string;
    errorDepositAlreadyPaid: string;
    errorNoDepositYet: string;
    errorPartialPaymentExists: string;
    errorProviderNotConfigured: string;
    errorGeneric: string;
  };

  paymentTypeLabels: {
    DEPOSIT: string;
    BALANCE: string;
    FULL_PAYMENT: string;
    MAINTENANCE: string;
  };

  /** Client accounts (Fase 2) — email/password only, no portal content
   *  yet. Kept deliberately separate from `portal` (the per-project
   *  capability-token area) — see the "Cuentas XAYVEN" architecture doc. */
  auth: {
    login: {
      eyebrow: string;
      heading: string;
      description: string;
      /** Brand phrase for the right-column visual panel on desktop —
       *  see AuthVisualPanel.tsx. Purely presentational copy. */
      panelTagline: string;
      emailLabel: string;
      emailPlaceholder: string;
      passwordLabel: string;
      passwordPlaceholder: string;
      submit: string;
      submitting: string;
      errorInvalidCredentials: string;
      errorGeneric: string;
      errorRateLimited: string;
      noAccount: string;
      registerLink: string;
    };
    register: {
      eyebrow: string;
      heading: string;
      description: string;
      panelTagline: string;
      /** Full name — display name only, never a username/alias; the
       *  auth identifier stays the email. See RegisterForm.tsx. */
      fullNameLabel: string;
      fullNamePlaceholder: string;
      emailLabel: string;
      emailPlaceholder: string;
      passwordLabel: string;
      passwordPlaceholder: string;
      confirmPasswordLabel: string;
      confirmPasswordPlaceholder: string;
      submit: string;
      submitting: string;
      successTitle: string;
      successBodyActive: string;
      successBodyConfirmEmail: string;
      goToAccountCta: string;
      errorEmailInUse: string;
      errorPasswordsDontMatch: string;
      errorWeakPassword: string;
      errorFullNameRequired: string;
      errorGeneric: string;
      errorRateLimited: string;
      haveAccount: string;
      loginLink: string;
    };
    account: {
      eyebrow: string;
      heading: string;
      /** Leading word for the personalized heading — "{greetingPrefix}
       *  {full_name}", e.g. "Hola, Ángel". See account/page.tsx. */
      greetingPrefix: string;
      emailLabel: string;
      roleLabel: string;
      sessionActiveLabel: string;
      logout: string;
    };
    roleLabels: {
      admin: string;
      staff: string;
      client: string;
    };
    /** Shared node labels for the login/register visual panel — purely
     *  decorative, suggest what an account unlocks (Fase 4+), nothing
     *  here is a real feature yet. See AuthVisualPanel.tsx. */
    panel: {
      projects: string;
      conversations: string;
      payments: string;
    };
  };
}
