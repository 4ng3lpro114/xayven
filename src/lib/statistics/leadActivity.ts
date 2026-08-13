import type { Conversation, LeadStatus } from "@/lib/db/types";

/**
 * Fase 10 (Analytics V2) — "lead activo" / "lead estancado" business rules.
 *
 * Neither concept existed anywhere in the codebase before this — the audit
 * (Fase 10 Etapa 1) found the raw data (`leadStatus`, `updatedAt`) but no
 * defined threshold. Per explicit instruction, using named constants
 * instead of a magic number scattered through the code:
 *
 *   - ACTIVE_LEAD_MAX_INACTIVITY_DAYS = 7  → still warm, touched recently.
 *   - STALE_LEAD_MIN_INACTIVITY_DAYS = 14 → gone quiet long enough to flag.
 *
 * The gap between 7 and 14 days is deliberate, not a bug: a lead updated
 * 10 days ago is neither "still active" nor "officially stalled" yet —
 * it's cooling. That bucket is tracked (`cooling`) so the four states
 * always partition every conversation with no double-counting and no
 * silently dropped lead, but it isn't one of the two headline numbers the
 * Leads section asks for (only `active`/`stalled` are).
 *
 * `client`/`support` are excluded from both buckets — per instruction,
 * they're outside the commercial pipeline (deriveLeadStatus() in
 * src/lib/ai/conversation.ts already treats them as sticky terminal
 * states, never something the AI or a threshold reclassifies).
 */
export const ACTIVE_LEAD_MAX_INACTIVITY_DAYS = 7;
export const STALE_LEAD_MIN_INACTIVITY_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

export type LeadActivityState = "active" | "cooling" | "stalled" | "out_of_pipeline";

const PIPELINE_STATUSES: ReadonlySet<LeadStatus> = new Set(["exploring", "interested", "hot"]);

export function daysSinceUpdate(updatedAt: string, now: Date): number {
  return (now.getTime() - new Date(updatedAt).getTime()) / DAY_MS;
}

export function classifyLeadActivity(
  conversation: Pick<Conversation, "leadStatus" | "updatedAt">,
  now: Date
): LeadActivityState {
  if (!PIPELINE_STATUSES.has(conversation.leadStatus)) return "out_of_pipeline";

  const days = daysSinceUpdate(conversation.updatedAt, now);
  if (days <= ACTIVE_LEAD_MAX_INACTIVITY_DAYS) return "active";
  if (days >= STALE_LEAD_MIN_INACTIVITY_DAYS) return "stalled";
  return "cooling";
}

export interface LeadActivityStats {
  activeCount: number;
  coolingCount: number;
  stalledCount: number;
  outOfPipelineCount: number;
  /** active + cooling + stalled — every conversation still in the
   *  commercial pipeline, regardless of activity bucket. */
  totalInPipeline: number;
  /** Average days since last activity, across in-pipeline conversations
   *  only (active + cooling + stalled) — null when there are none. Never
   *  computed over client/support conversations, which are expected to go
   *  quiet by design once resolved. */
  averageDaysSinceActivity: number | null;
}

export function buildLeadActivityStats(conversations: Conversation[], now: Date): LeadActivityStats {
  let activeCount = 0;
  let coolingCount = 0;
  let stalledCount = 0;
  let outOfPipelineCount = 0;
  let inPipelineDaysSum = 0;
  let inPipelineCount = 0;

  for (const c of conversations) {
    const state = classifyLeadActivity(c, now);
    if (state === "out_of_pipeline") {
      outOfPipelineCount += 1;
      continue;
    }
    if (state === "active") activeCount += 1;
    else if (state === "cooling") coolingCount += 1;
    else stalledCount += 1;

    inPipelineDaysSum += daysSinceUpdate(c.updatedAt, now);
    inPipelineCount += 1;
  }

  return {
    activeCount,
    coolingCount,
    stalledCount,
    outOfPipelineCount,
    totalInPipeline: activeCount + coolingCount + stalledCount,
    averageDaysSinceActivity: inPipelineCount > 0 ? Math.round((inPipelineDaysSum / inPipelineCount) * 10) / 10 : null,
  };
}
