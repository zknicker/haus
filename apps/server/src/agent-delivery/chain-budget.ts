import { and, eq, gt, lt } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentDeliveryTable } from '../postgres/schema.ts';

// The automation chain budget (specs/github-triggers.md#automation-chain-budget).
// A drain made only of automation-authored work (Agent messages, Trigger fires,
// Trigger problem notices) spends one turn; any other work (a human message, a
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

export function isAutomationAuthored(row: AuthoredWork): boolean {
    return (
        row.source.startsWith('agent:') ||
        row.source === 'trigger' ||
        row.source === 'trigger_problem'
    );
}

export function canBeginAgentDrain(rows: AuthoredWork[], currentTurns: number): boolean {
    return !isPureAutomationDrain(rows) || currentTurns < maxAgentChainTurns;
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
