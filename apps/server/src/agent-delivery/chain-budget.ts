import { and, eq, gt, inArray, isNull, lt, notInArray, notLike, or } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentDeliveryTable, agentInboxTable } from '../postgres/schema.ts';
import { concreteInboxSources } from './inbox-lanes.ts';
import { type InboxItemRow, inboxItemColumns, inboxOrder, queuedFor } from './store.ts';

// The automation chain budget (specs/github-triggers.md#automation-chain-budget).
// A drain made only of automation-authored work (Agent messages, Trigger fires,
// Trigger problem notices, Haus-caused Linear session events) spends one turn; any other work (a human message, a
// Reminder, a task assignment) resets the chain. At the ceiling the drain
// holds until a human speaks. A chain that has sat idle for half an hour below
// the ceiling restarts, so spaced, legitimate fires never accumulate.

export const maxAgentChainTurns = 16;
/** A drain starting this long after the chain last advanced starts from zero. */
export const agentChainIdleResetMs = 30 * 60 * 1000;

interface AuthoredWork {
    source: string;
}

/** The chain's persisted state on `agent_delivery`. */
export interface AgentChain {
    agentChainAdvancedAt: Date | null;
    agentChainTurns: number;
}

/**
 * Automation-authored typed sources. Agent messages (`agent:*`) are the rest.
 * A Linear session event caused by a Haus write is automation; one caused by
 * a person (`linear_session`) resets the chain like a human message.
 */
const automationInboxSources = [
    'trigger',
    'trigger_problem',
    'image_generation_failed',
    'linear_session_automated',
] as const;

export function isAutomationAuthored(row: AuthoredWork): boolean {
    return (
        row.source.startsWith('agent:') ||
        (automationInboxSources as readonly string[]).includes(row.source)
    );
}

export function canBeginAgentDrain(rows: AuthoredWork[], currentTurns: number): boolean {
    return !isPureAutomationDrain(rows) || currentTurns < maxAgentChainTurns;
}

/**
 * Chooses the drain before admitting it: admission judges the rows that will
 * actually run, never the whole queue. At the ceiling an automation-only drain
 * holds, and the oldest work that resets the chain (a Reminder, a task
 * assignment, a human message) leads instead, so the held automation drains
 * after it from zero. Null holds the Agent.
 */
export function admitAgentDrain<Row extends AuthoredWork>(
    candidates: readonly Row[],
    lead: Row,
    currentTurns: number,
    select: (lead: Row) => Row[]
): { lead: Row; selected: Row[] } | null {
    const selected = select(lead);
    if (canBeginAgentDrain(selected, currentTurns)) {
        return { lead, selected };
    }
    const resetting = candidates.find((row) => !isAutomationAuthored(row));
    if (!resetting) {
        return null;
    }
    const instead = select(resetting);
    return canBeginAgentDrain(instead, currentTurns)
        ? { lead: resetting, selected: instead }
        : null;
}

/**
 * {@link admitAgentDrain} over the drain candidate windows, widened at the
 * ceiling: reset work can queue behind more automation than the windows hold,
 * so the oldest of it anywhere in the queue may still lead.
 */
export async function admitQueuedAgentDrain(
    tx: HausDatabase,
    drain: { agentId: string; candidates: InboxItemRow[]; chainTurns: number; lead: InboxItemRow },
    select: (rows: InboxItemRow[], source: string) => InboxItemRow[]
): Promise<{ lead: InboxItemRow; selected: InboxItemRow[] } | null> {
    const { agentId, candidates, chainTurns } = drain;
    const admitted = admitAgentDrain(candidates, drain.lead, chainTurns, (lead) =>
        select(candidates, lead.source)
    );
    if (admitted || chainTurns < maxAgentChainTurns) {
        return admitted;
    }
    const resetting = await findOldestQueuedChainResetItem(tx, agentId);
    if (!resetting || candidates.some((row) => row.id === resetting.id)) {
        return null;
    }
    const widened = [resetting, ...candidates];
    return admitAgentDrain(widened, resetting, chainTurns, (lead) => select(widened, lead.source));
}

/**
 * The chain after a completed drain. A turn that settled only notices leaves
 * it untouched (null); an automation-only drain advances it and stamps when;
 * anything else resets it.
 */
export function nextAgentChain(
    rows: AuthoredWork[],
    currentTurns: number,
    now: Date
): AgentChain | null {
    if (rows.length === 0) {
        return null;
    }
    return isPureAutomationDrain(rows)
        ? { agentChainAdvancedAt: now, agentChainTurns: currentTurns + 1 }
        : { agentChainAdvancedAt: null, agentChainTurns: 0 };
}

/**
 * The turns a drain starting `now` counts from. A chain below the ceiling
 * whose last advance is older than the idle window is reset to zero here, as
 * the drain is planned; an exhausted chain never times out.
 */
export async function restartIdleAgentChain(
    tx: HausDatabase,
    agentId: string,
    currentTurns: number,
    now = new Date()
): Promise<number> {
    const restarted = await tx
        .update(agentDeliveryTable)
        .set({ agentChainAdvancedAt: null, agentChainTurns: 0, updatedAt: now })
        .where(
            and(
                eq(agentDeliveryTable.agentId, agentId),
                gt(agentDeliveryTable.agentChainTurns, 0),
                lt(agentDeliveryTable.agentChainTurns, maxAgentChainTurns),
                lt(
                    agentDeliveryTable.agentChainAdvancedAt,
                    new Date(now.getTime() - agentChainIdleResetMs)
                )
            )
        )
        .returning({ agentId: agentDeliveryTable.agentId });
    return restarted.length > 0 ? 0 : currentTurns;
}

/** Records a completed drain's effect on the chain (see {@link nextAgentChain}). */
export async function settleAgentChain(
    tx: HausDatabase,
    agentId: string,
    rows: AuthoredWork[],
    currentTurns: number,
    now = new Date()
): Promise<void> {
    const chain = nextAgentChain(rows, currentTurns, now);
    if (!chain) {
        return;
    }
    await tx
        .update(agentDeliveryTable)
        .set({ ...chain, updatedAt: now })
        .where(eq(agentDeliveryTable.agentId, agentId));
}

function isPureAutomationDrain(rows: AuthoredWork[]): boolean {
    return rows.length > 0 && rows.every(isAutomationAuthored);
}

/**
 * The oldest drainable work that resets the chain, matching the drain
 * candidate windows: concrete work, or notice-lane work not yet offered.
 */
async function findOldestQueuedChainResetItem(
    tx: HausDatabase,
    agentId: string
): Promise<InboxItemRow | undefined> {
    const [row] = await tx
        .select(inboxItemColumns)
        .from(agentInboxTable)
        .where(
            and(
                queuedFor(agentId),
                notLike(agentInboxTable.source, 'agent:%'),
                notInArray(agentInboxTable.source, [...automationInboxSources]),
                or(
                    inArray(agentInboxTable.source, [...concreteInboxSources]),
                    isNull(agentInboxTable.noticeRunId)
                )
            )
        )
        .orderBy(...inboxOrder())
        .limit(1);
    return row;
}
