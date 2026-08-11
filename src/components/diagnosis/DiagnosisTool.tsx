"use client";

import { useState } from "react";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { computeDiagnosisResult, buildDiagnosisContext } from "@/lib/diagnosis";
import { setDiagnosisContext, openChatWidget } from "@/lib/ai/clientSession";
import type { Dictionary } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n/config";

interface DiagnosisToolProps {
  dict: Dictionary["diagnosis"];
  locale: Locale;
  contactHref: string;
}

export function DiagnosisTool({ dict, locale, contactHref }: DiagnosisToolProps) {
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const reduceMotion = useReducedMotion();

  const totalSteps = dict.questions.length;
  const finished = answers.length === totalSteps;

  function selectOption(optionIndex: number) {
    const next = [...answers.slice(0, step), optionIndex];
    setAnswers(next);
    if (step < totalSteps - 1) {
      setStep(step + 1);
    }
  }

  function goBack() {
    if (step === 0) return;
    setStep(step - 1);
    setAnswers(answers.slice(0, step));
  }

  function restart() {
    setStarted(false);
    setStep(0);
    setAnswers([]);
  }

  function talkToXayven() {
    const resultKey = computeDiagnosisResult(answers);
    const resultTitle = dict.results[resultKey].title;
    const context = buildDiagnosisContext(
      locale,
      dict.questions.map((q) => q.question),
      answers.map((a, i) => dict.questions[i].options[a]),
      resultTitle
    );
    setDiagnosisContext(context);
    openChatWidget();
  }

  if (!started) {
    return (
      <div className="rounded-xl border border-border-accent bg-bg-raised p-8 text-center sm:p-12">
        <p className="text-base text-fg-muted">{dict.description}</p>
        <div className="mt-6">
          <Button size="lg" withArrow onClick={() => setStarted(true)}>
            {dict.startCta}
          </Button>
        </div>
      </div>
    );
  }

  if (finished) {
    const resultKey = computeDiagnosisResult(answers);
    const result = dict.results[resultKey];

    return (
      <div className="rounded-xl border border-border-accent bg-bg-raised p-8 sm:p-12">
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-accent-300">
          {dict.resultHeading}
        </p>
        <h3 className="mt-3 text-2xl font-semibold text-fg">{result.title}</h3>
        <p className="mt-3 max-w-lg text-base text-fg-muted">{result.description}</p>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Button size="lg" withArrow onClick={talkToXayven}>
            <MessageSquare className="size-4" aria-hidden="true" />
            {dict.ctaTalk}
          </Button>
          <Button size="lg" variant="secondary" href={contactHref}>
            {dict.ctaContact}
          </Button>
        </div>

        <button
          type="button"
          onClick={restart}
          className="mt-6 text-sm text-fg-subtle underline transition-colors hover:text-fg-muted"
        >
          {dict.restart}
        </button>
      </div>
    );
  }

  const question = dict.questions[step];

  return (
    <div className="rounded-xl border border-border bg-bg-raised p-8 sm:p-12">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-fg-subtle">
          {dict.stepLabel} {step + 1}/{totalSteps}
        </p>
        {step > 0 && (
          <button
            type="button"
            onClick={goBack}
            className="inline-flex items-center gap-1 text-xs text-fg-subtle transition-colors hover:text-fg-muted"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            {dict.backLabel}
          </button>
        )}
      </div>

      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-bg-elevated">
        <div
          className="h-full rounded-full bg-accent-500 transition-all duration-300"
          style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -12 }}
          transition={{ duration: 0.2 }}
        >
          <h3 className="mt-6 text-xl font-semibold text-fg sm:text-2xl">{question.question}</h3>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {question.options.map((option, i) => (
              <button
                key={option}
                type="button"
                onClick={() => selectOption(i)}
                className="rounded-lg border border-border-strong bg-bg-elevated px-4 py-3.5 text-left text-sm text-fg transition-colors hover:border-border-accent hover:bg-bg-overlay"
              >
                {option}
              </button>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
