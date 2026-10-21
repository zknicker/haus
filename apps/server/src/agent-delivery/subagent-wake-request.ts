import type {
    AgentSubagentWakeRequest,
    AgentSubagentWakeResult,
    AgentSubagentWakeRetire,
} from '@haus/api';
import { and, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentInboxTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { isAgentChainHeld } from './chain-budget.ts';
import { isConfigured } from './deferred-configuration.ts';
import type { AgentDelivery } from './delivery.ts';
import { readAgentDispatchConfig } from './dispatch-config.ts';
import * as store from './store.ts';

type WakeOutcome = AgentSubagentWakeResult['outcome'];

/**
 * Admits a sub-agent wake its Computer asked for: background work the Agent started finished
 * or stopped after the turn that started it (specs/runtime-drivers.md "Background work"). It
 * queues only for a configured, running Agent assigned to that Computer, in the session
 * generation the work ran in, so a wake that crosses a session reset is refused. One queued
 * wake covers every report: several finishing at once share one turn. At the automation chain
 * ceiling, with no reset work queued to lead, the wake is refused rather than held, so the
 * Computer stops the turn the runtime started on its own. A resent request is answered again.
 */
export async function requestSubagentWake(
    db: HausDatabase,
    delivery: AgentDelivery,
    input: { computerId: string; request: AgentSubagentWakeRequest; serverId: string }
): Promise<WakeOutcome> {
    const { agentId, sessionGeneration, wakeId } = input.request;
    const admitted = await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const config = await readHostedConfig(tx, input);
        if (config?.sessionGeneration !== sessionGeneration) {
            return null;
        }
        const state = await store.readDeliveryState(tx, agentId);
        if (state?.stopped) {
            return null;
        }
        const dedupeKey = wakeDedupeKey(agentId, wakeId);
        if ((await findWake(tx, agentId, { dedupeKey })) || (await findWake(tx, agentId, {}))) {
            // This request already queued (a resend), or a queued wake covers it.
            return { queued: false };
        }
        // An active run settles the chain first; it either reset it or adopted the turn.
        if (
            !state?.activeRunId &&
            (await isAgentChainHeld(tx, agentId, state?.agentChainTurns ?? 0))
        ) {
            return null;
        }
        await delivery.enqueue(tx, {
            agentId,
            chatId: null,
            content: '',
            dedupeKey,
            serverId: input.serverId,
            source: 'subagent',
        });
        return { queued: true };
    });
    if (admitted?.queued) {
        await delivery.dispatchAgent(agentId, input.serverId);
    }
    return admitted ? 'accepted' : 'refused';
}

/**
 * Retires one queued wake: a run that was not the wake adopted the turn it was for, so the
 * report is handled. A wake already leading a run is left to finish.
 */
export async function retireSubagentWake(
    db: HausDatabase,
    input: { computerId: string; request: AgentSubagentWakeRetire; serverId: string }
): Promise<void> {
    const { agentId, wakeId } = input.request;
    await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        if (!(await readHostedConfig(tx, input))) {
            return;
        }
        await tx
            .update(agentInboxTable)
            .set({ seenAt: new Date(), state: 'seen' })
            .where(
                and(
                    queuedWake(agentId),
                    eq(agentInboxTable.dedupeKey, wakeDedupeKey(agentId, wakeId))
                )
            );
    });
}

/**
 * Retires an Agent's queued sub-agent wakes as `seen` when Stop or a session reset ends the
 * background work they would report.
 */
export async function retireQueuedSubagentWakes(db: HausDatabase, agentId: string): Promise<void> {
    await db
        .update(agentInboxTable)
        .set({ seenAt: new Date(), state: 'seen' })
        .where(queuedWake(agentId));
}

function wakeDedupeKey(agentId: string, wakeId: string): string {
    return `subagent:${agentId}:${wakeId}`;
}

/** The Agent's dispatch config when it is configured on this Server and Computer, else null. */
async function readHostedConfig(
    tx: HausDatabase,
    input: { computerId: string; request: { agentId: string }; serverId: string }
) {
    const { agentId } = input.request;
    if ((await store.readAgentServerId(tx, agentId)) !== input.serverId) {
        return null;
    }
    const config = await readAgentDispatchConfig(tx, agentId);
    return isConfigured(config) && config.computerId === input.computerId ? config : null;
}

/** A wake row by its identity (any state), or else any wake still queued. */
async function findWake(tx: HausDatabase, agentId: string, by: { dedupeKey?: string }) {
    const [row] = await tx
        .select({ id: agentInboxTable.id })
        .from(agentInboxTable)
        .where(
            by.dedupeKey
                ? and(
                      eq(agentInboxTable.agentId, agentId),
                      eq(agentInboxTable.dedupeKey, by.dedupeKey)
                  )
                : queuedWake(agentId)
        )
        .limit(1);
    return row;
}

function queuedWake(agentId: string) {
    return and(
        eq(agentInboxTable.agentId, agentId),
        eq(agentInboxTable.source, 'subagent'),
        eq(agentInboxTable.state, 'queued'),
        isNull(agentInboxTable.runId)
    );
}
