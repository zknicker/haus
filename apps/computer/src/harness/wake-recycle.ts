import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentSessionState } from './session-store.ts';

/**
 * EXPERIMENT (wake-recycle prototype, default off): Raft RFC 070 phase 1. A wake that lands after
 * the provider prompt cache has expired, on a large session, re-writes the whole context at
 * cache-write prices if it resumes. Recycling starts a fresh runtime session instead and carries
 * continuity in the first user input (memory-index + briefing). The managed system prompt is
 * unchanged.
 */
export interface WakeRecycleConfig {
    enabled: boolean;
    minContextTokens: number;
    minIdleMs: number;
}

export type WakeRecycleResumeReason =
    | 'cache_possibly_warm'
    | 'context_below_threshold'
    | 'disabled'
    | 'agent_opted_out'
    | 'no_prior_session'
    | 'turn_facts_unavailable';

export type WakeRecycleDecision =
    | {
          idleMs: number;
          priorContextTokens: number;
          reason: 'cold_gap_large_context';
          recycle: true;
      }
    | {
          idleMs: number | null;
          priorContextTokens: number | null;
          reason: WakeRecycleResumeReason;
          recycle: false;
      };

/** A per-Agent marker under the Agent root (outside its workspace) keeps that Agent resuming. */
export const wakeRecycleOptOutFileName = 'wake-recycle-off';

const defaultMinIdleMs = 60 * 60_000;
const defaultMinContextTokens = 128_000;

export function readWakeRecycleConfig(
    env: Record<string, string | undefined> = process.env
): WakeRecycleConfig {
    return {
        enabled: env.HAUS_WAKE_RECYCLE === '1',
        minContextTokens: positiveInteger(
            env.HAUS_WAKE_RECYCLE_MIN_CONTEXT_TOKENS,
            defaultMinContextTokens
        ),
        minIdleMs: positiveInteger(env.HAUS_WAKE_RECYCLE_MIN_IDLE_MS, defaultMinIdleMs),
    };
}

/** Gates in Raft's order; both thresholds are strict. */
export function decideWakeRecycle(input: {
    config: WakeRecycleConfig;
    now: number;
    optedOut: boolean;
    session: Pick<AgentSessionState, 'lastContextTokens' | 'lastTurnEndedAt' | 'resumeState'>;
}): WakeRecycleDecision {
    const { config, session } = input;
    const priorContextTokens = session.lastContextTokens ?? null;
    const endedAt = session.lastTurnEndedAt ? Date.parse(session.lastTurnEndedAt) : Number.NaN;
    const idleMs = Number.isNaN(endedAt) ? null : Math.max(0, input.now - endedAt);
    const resume = (reason: WakeRecycleResumeReason): WakeRecycleDecision => ({
        idleMs,
        priorContextTokens,
        reason,
        recycle: false,
    });
    if (!config.enabled) {
        return resume('disabled');
    }
    if (input.optedOut) {
        return resume('agent_opted_out');
    }
    if (session.resumeState === null) {
        return resume('no_prior_session');
    }
    if (idleMs === null || priorContextTokens === null) {
        return resume('turn_facts_unavailable');
    }
    if (idleMs <= config.minIdleMs) {
        return resume('cache_possibly_warm');
    }
    if (priorContextTokens <= config.minContextTokens) {
        return resume('context_below_threshold');
    }
    return { idleMs, priorContextTokens, reason: 'cold_gap_large_context', recycle: true };
}

/** Retires the resume coordinates and moves to a fresh, never-used runtime session id. */
export function recycledSession(session: AgentSessionState): AgentSessionState {
    return {
        ...session,
        resumeState: null,
        runtimeSessionId: null,
        wakeRecycleCount: (session.wakeRecycleCount ?? 0) + 1,
    };
}

/**
 * The cold session id. A recycled session gets a `-w<n>` suffix so the cold-start cleanup of
 * `.agent-runs/<sessionId>` never touches the retired session's directory.
 */
export function coldSessionId(agentId: string, session: AgentSessionState): string {
    const base = `${agentId}-${session.generation}`;
    return session.wakeRecycleCount ? `${base}-w${session.wakeRecycleCount}` : base;
}

export async function isWakeRecycleOptedOut(agentRoot: string): Promise<boolean> {
    try {
        await readFile(join(agentRoot, wakeRecycleOptOutFileName));
        return true;
    } catch {
        return false;
    }
}

export function describeWakeRecycle(agentId: string, decision: WakeRecycleDecision): string {
    const idle = decision.idleMs === null ? 'unknown' : String(Math.round(decision.idleMs));
    const context =
        decision.priorContextTokens === null ? 'unknown' : String(decision.priorContextTokens);
    return `[WakeRecycle] agent=${agentId} decision=${decision.recycle ? 'recycle' : 'resume'} reason=${decision.reason} idle_ms=${idle} prior_context_tokens=${context}`;
}

function positiveInteger(raw: string | undefined, fallback: number): number {
    const value = raw === undefined ? Number.NaN : Number(raw);
    return Number.isInteger(value) && value > 0 ? value : fallback;
}
