import type { ComputerRuntimeId, UsageOverview, UsageStale } from '@haus/api';
import { type DisplayPlanWindow, selectWindow } from './runtime-plan-windows.ts';

type ProviderUsageState = UsageOverview['claude'] | UsageOverview['codex'] | UsageOverview['grok'];
export type RuntimeIssue = 'authentication' | 'usage';
type CodexWindows = Extract<UsageOverview['codex'], { status: 'ok' }>['snapshot']['windows'];

/** Mirrors `SESSION_WINDOW_MAX_SECONDS` in `@haus/codex-usage`. */
const SESSION_WINDOW_MAX_SECONDS = 21_600;

export interface RuntimeUsageRow {
    capturedAt: string | null;
    fiveHourWindow: DisplayPlanWindow | null;
    id: ComputerRuntimeId;
    issue: RuntimeIssue | null;
    /** Present when the Computer is showing last-known numbers, and why. */
    stale: UsageStale | null;
    status: string;
    title: string;
    window: DisplayPlanWindow | null;
}

export function buildRuntimeRow(
    id: ComputerRuntimeId,
    usage: UsageOverview,
    piAgentCount: number | null
): RuntimeUsageRow {
    const title = runtimeLabels[id];

    if (id === 'codex') {
        const codex = usage.codex;
        return {
            capturedAt: codex.status === 'ok' ? codex.snapshot.capturedAt : null,
            fiveHourWindow: codex.status === 'ok' ? codexBurstWindow(codex.snapshot.windows) : null,
            id,
            issue: usageIssue(codex),
            stale: retainedReason(codex),
            status: 'Plan limits unavailable',
            title,
            // The weekly column is the weekly window or nothing. Falling back to
            // the session window here labelled a 5-hour burst allowance "Weekly
            // Limit", which made the runtime rows incomparable.
            window:
                codex.status === 'ok'
                    ? selectWindow(codex.snapshot.windows, 'current-week', 'Weekly Limit')
                    : null,
        };
    }

    if (id === 'claude-code') {
        const claude = usage.claude;
        return {
            capturedAt: claude.status === 'ok' ? claude.snapshot.capturedAt : null,
            fiveHourWindow:
                claude.status === 'ok'
                    ? selectWindow(claude.snapshot.windows, 'current-session', '5h')
                    : null,
            id,
            issue: usageIssue(claude),
            stale: retainedReason(claude),
            status: 'Plan limits unavailable',
            title,
            window:
                claude.status === 'ok'
                    ? selectWindow(
                          claude.snapshot.windows,
                          'current-week-all-models',
                          'Weekly Limit'
                      )
                    : null,
        };
    }

    if (id === 'grok-build') {
        const grok = usage.grok;
        return {
            capturedAt: grok.status === 'ok' ? grok.snapshot.capturedAt : null,
            fiveHourWindow: null,
            id,
            issue: usageIssue(grok),
            stale: retainedReason(grok),
            status: 'Weekly limit unavailable',
            title,
            window:
                grok.status === 'ok'
                    ? (grok.snapshot.windows.find(
                          (candidate) => candidate.label === 'Weekly Limit'
                      ) ?? null)
                    : null,
        };
    }

    return {
        capturedAt: null,
        fiveHourWindow: null,
        id,
        issue: null,
        stale: null,
        status: piAgentSummary(piAgentCount),
        title,
        window: null,
    };
}

/**
 * A retained snapshot is known to be out of date, so it does not wait for the
 * freshness heuristic. Everything else falls back to capture age and to whether
 * a displayed allowance window has already reset.
 */
export function staleUsageTimestamp(row: RuntimeUsageRow, now: number): string | null {
    if (!row.capturedAt) {
        return null;
    }
    if (row.stale) {
        return row.capturedAt;
    }
    const expiredWindow = [row.window, row.fiveHourWindow].some(
        (window) => window?.resetsAt && Date.parse(window.resetsAt) <= now
    );
    return now - Date.parse(row.capturedAt) >= 30 * 60_000 || expiredWindow ? row.capturedAt : null;
}

function retainedReason(state: ProviderUsageState): UsageStale | null {
    return state.status === 'ok' ? (state.stale ?? null) : null;
}

function usageIssue(state: ProviderUsageState): RuntimeIssue | null {
    const code = state.status === 'error' ? state.error.code : state.stale?.code;
    return code ? (code === 'auth' ? 'authentication' : 'usage') : null;
}

/**
 * A Computer that predates duration-based Codex window classification can still
 * report a weekly allowance as `current-session`. A number that cannot be a
 * 5-hour burst leaves the column empty rather than being labelled one.
 */
function codexBurstWindow(windows: CodexWindows): DisplayPlanWindow | null {
    const session = windows.find((candidate) => candidate.id === 'current-session');
    if (!session || (session.resetAfterSeconds ?? 0) > SESSION_WINDOW_MAX_SECONDS) {
        return null;
    }
    return selectWindow([session], 'current-session', '5h');
}

function piAgentSummary(agentCount: number | null) {
    if (agentCount === null) {
        return 'API-backed · Usage tracked automatically';
    }
    return agentCount === 0
        ? 'API-backed · No Agents using Pi'
        : `API-backed · ${agentCount} ${agentCount === 1 ? 'Agent' : 'Agents'}`;
}

export const runtimeOrder: ComputerRuntimeId[] = ['codex', 'claude-code', 'grok-build', 'pi'];

const runtimeLabels: Record<ComputerRuntimeId, string> = {
    'claude-code': 'Claude Code',
    codex: 'Codex',
    'grok-build': 'Grok Build',
    pi: 'Pi',
};
