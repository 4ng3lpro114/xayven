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
  };
  hero: {
    eyebrow: string;
    headline: string;
    headlineAccent: string;
    subheadline: string;
    ctaPrimary: string;
    ctaSecondary: string;
    visualCaption: string;
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
    fieldLabels: { who: string; problem: string; outcome: string };
    items: {
      title: string;
      summary: string;
      who: string;
      problem: string;
      outcome: string;
    }[];
  };
  why: {
    eyebrow: string;
    heading: string;
    description: string;
    items: { title: string; description: string }[];
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
    plans: {
      name: string;
      tagline: string;
      who: string;
      features: string[];
      priceLabel: string;
    }[];
    ctaLabel: string;
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
}
