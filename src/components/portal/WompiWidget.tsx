"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Wompi's WidgetCheckout — the PROGRAMMATIC integration method (see
 * docs.wompi.co "Widget & Checkout Web", confirmed August 2026), used
 * instead of the declarative `<script data-render="button">` auto-mount
 * pattern this component used previously.
 *
 * Why: the declarative pattern auto-injects a <button> into the DOM by
 * scanning for its own <script> tag — first via `document.currentScript`
 * (only valid during a script's own synchronous top-level execution;
 * MDN: "this will not reference the <script> element if the code... is
 * being called as a callback or event handler"). Two failure modes
 * followed from that, both confirmed in this app:
 *   1. React re-rendering the host element (this panel lives inside
 *      <Reveal>, a client-animated wrapper) pruned the DOM node Wompi
 *      injected, since React never authored it.
 *   2. Even after fixing (1), a dynamically-created <script> defaults to
 *      async=true, under which `document.currentScript` is unavailable
 *      during the script's own initial run — whatever internal reference
 *      Wompi's click handler depends on resolved to null, crashing on
 *      click with "Cannot read properties of null (reading
 *      'addEventListener')", entirely inside widget.js.
 *
 * WidgetCheckout sidesteps both: we load the script once (position in the
 * DOM is irrelevant — it only needs to expose `window.WidgetCheckout`),
 * render our OWN button (a real React element, never pruned because
 * React owns it), and open the checkout explicitly in our own click
 * handler — no DOM-scanning, no currentScript, nothing for React's
 * reconciliation to fight over.
 *
 * NOTE on `redirectUrl` (config.redirectUrl, built from NEXT_PUBLIC_SITE_URL
 * — see src/lib/constants.ts / src/lib/payments/service.ts): Wompi's own
 * CloudFront/WAF rejects (403) any checkout request whose redirect-url
 * points at a loopback host (localhost / 127.0.0.1) — confirmed by
 * reproducing the exact request outside the browser. NEXT_PUBLIC_SITE_URL
 * must be a real publicly-reachable HTTPS URL (e.g. your ngrok tunnel)
 * during Sandbox testing, not http://localhost:3000. This is an
 * environment-configuration concern, not something this component (or any
 * other file in this app) can or should work around.
 */

interface WompiWidgetConfig {
  currency: string;
  amountInCents: number;
  reference: string;
  publicKey: string;
  signature: { integrity: string };
  redirectUrl: string;
}

interface WompiTransactionResult {
  transaction?: { id?: string; status?: string };
}

declare global {
  interface Window {
    WidgetCheckout?: new (config: WompiWidgetConfig) => {
      open: (callback: (result: WompiTransactionResult) => void) => void;
    };
  }
}

interface WompiWidgetProps {
  scriptSrc: string;
  config: WompiWidgetConfig;
  label: string;
}

// Module-scoped (not component state) so widget.js is fetched at most
// ONCE per page load, no matter how many times this component mounts —
// e.g. re-navigating between DEPOSIT/BALANCE, or React remounting it.
let wompiScriptPromise: Promise<void> | null = null;

function loadWompiScript(src: string): Promise<void> {
  if (typeof window.WidgetCheckout === "function") return Promise.resolve();
  if (!wompiScriptPromise) {
    wompiScriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.addEventListener("load", () => resolve(), { once: true });
      script.addEventListener(
        "error",
        () => {
          wompiScriptPromise = null; // allow a retry on the next mount
          reject(new Error("widget.js failed to load"));
        },
        { once: true }
      );
      document.head.appendChild(script);
    });
  }
  return wompiScriptPromise;
}

export function WompiWidget({ scriptSrc, config, label }: WompiWidgetProps) {
  const [ready, setReady] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    loadWompiScript(scriptSrc)
      .then(() => {
        if (mountedRef.current) setReady(true);
      })
      .catch((error: unknown) => {
        console.error("[wompi-widget] could not load checkout.wompi.co/widget.js", error);
      });

    return () => {
      mountedRef.current = false;
    };
  }, [scriptSrc]);

  function handleClick() {
    if (typeof window.WidgetCheckout !== "function") return;

    const checkout = new window.WidgetCheckout(config);
    checkout.open((result) => {
      // Never trust this callback's own claim about the outcome (same rule
      // as everywhere else in this app — see docs/payments.md §6): just
      // send the browser to the same return URL `redirectUrl` already
      // pointed at, with whatever transaction id we got, so the SERVER
      // re-fetches the real status via reconcileTransaction and applies it
      // through the one idempotent core every provider funnels through.
      const target = new URL(config.redirectUrl);
      const transactionId = result?.transaction?.id;
      if (transactionId) target.searchParams.set("id", transactionId);
      window.location.href = target.toString();
    });
  }

  return (
    <div className="mt-6">
      <Button type="button" size="lg" withArrow disabled={!ready} onClick={handleClick}>
        {label}
      </Button>
    </div>
  );
}
