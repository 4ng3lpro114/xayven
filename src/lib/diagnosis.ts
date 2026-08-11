export type DiagnosisResultKey =
  | "newSite"
  | "redesign"
  | "cro"
  | "ecommerce"
  | "maintenance"
  | "seoPerformance"
  | "audit";

/**
 * Deterministic, rule-based mapping from the 5 diagnosis answers (each an
 * option index) to a result. No AI involved — this only needs to be
 * directionally useful, not perfect, and it must stay predictable.
 *
 * Question order: [hasSite, mainProblem, goal, businessType, urgency]
 */
export function computeDiagnosisResult(answers: number[]): DiagnosisResultKey {
  const [hasSite, problem, goal] = answers;

  // No website yet.
  if (hasSite === 2) {
    return goal === 2 ? "ecommerce" : "newSite";
  }

  // Has a site but it needs improvement.
  if (hasSite === 0) {
    if (problem === 0) return "redesign"; // looks outdated
    if (problem === 1 || problem === 2) return "seoPerformance"; // slow / not on Google
    if (problem === 3) return "cro"; // not generating leads or sales
    if (goal === 2) return "ecommerce";
    return "audit";
  }

  // Has a site and it works well.
  if (hasSite === 1) {
    if (problem === 1 || problem === 2) return "seoPerformance";
    if (goal === 0) return "cro";
    if (goal === 2) return "ecommerce";
    return "maintenance";
  }

  return "audit";
}

/** Builds a short natural-language handoff for XAYVEN AI, in the visitor's
 *  own language, so the chat can pick up right where the diagnosis left off. */
export function buildDiagnosisContext(
  locale: "es" | "en",
  questionLabels: string[],
  answerLabels: string[],
  resultTitle: string
): string {
  if (locale === "en") {
    return `I just completed the website diagnosis. My answers: ${questionLabels
      .map((q, i) => `${q} → ${answerLabels[i]}`)
      .join("; ")}. The suggested result was: ${resultTitle}.`;
  }
  return `Acabo de completar el diagnóstico web. Mis respuestas: ${questionLabels
    .map((q, i) => `${q} → ${answerLabels[i]}`)
    .join("; ")}. El resultado sugerido fue: ${resultTitle}.`;
}
