import type { AgentCommand } from '@haus/api';
import { and, eq, isNull, lt } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { agentInboxTable } from '../postgres/schema.ts';
import { appendServerAgentActivity } from '../server-agents/agent-activity.ts';
import { recordRunTrigger } from '../server-agents/record-agent-turn.ts';
import type { ConfiguredAgent } from './deferred-configuration.ts';
import type { DispatchPlan } from './delivery.ts';
import { type AgentDispatchConfig, startPromptFacts } from './dispatch-config.ts';
import * as store from './store.ts';

type DreamFrameConfig = Pick<
    AgentDispatchConfig,
    | 'agentConversationStyle'
    | 'agentDescription'
    | 'agentName'
    | 'agentSignatureEmoji'
    | 'connectionChips'
    | 'homeTimezone'
    | 'sessionGeneration'
>;

/** A dream still queued this long after its request missed its night; it is retired, never led. */
export const dreamStaleMs = 4 * 60 * 60 * 1000;

/**
 * Retires an Agent's stale queued dreams as `seen`, keeping the night's dedupe
 * identity. Everything else about a dream is ordinary concrete inbox handling.
 */
export async function retireStaleDreams(db: HausDatabase, agentId: string): Promise<void> {
    await db
        .update(agentInboxTable)
        .set({ seenAt: new Date(), state: 'seen' })
        .where(
            and(
                eq(agentInboxTable.agentId, agentId),
                eq(agentInboxTable.source, 'dream'),
                eq(agentInboxTable.state, 'queued'),
                isNull(agentInboxTable.runId),
                lt(agentInboxTable.createdAt, new Date(Date.now() - dreamStaleMs))
            )
        );
}

/**
 * Starts the run a queued dream leads. A dream is concrete work, so its run carries
 * it alone; having no Chat, the run has no inbox items, digest, or Chat lifecycle
 * event. Busy notices, settlement, failure, and Stop treat it like any concrete run.
 */
export async function planDreamRun(
    tx: HausDatabase,
    input: {
        agentId: string;
        config: ConfiguredAgent;
        row: store.InboxItemRow;
        state: store.AgentDeliveryRow;
    }
): Promise<DispatchPlan> {
    const { agentId, config, row, state } = input;
    const runId = createOpaqueId('run');
    await store.attachQueuedItemsToRun(tx, { agentId, itemIds: [row.id], runId });
    await store.beginActiveRun(tx, {
        agentId,
        chatId: null,
        computerId: config.computerId,
        modelId: config.desiredModelId,
        reasoningEffort: config.desiredReasoningEffort,
        runId,
        runtimeId: config.desiredRuntimeId,
    });
    await recordRunTrigger(tx, { agentId, runId, serverId: state.serverId }, row);
    const activity = await appendServerAgentActivity(tx, {
        agentId,
        category: 'starting_work',
        phase: 'started',
        runId,
        serverId: state.serverId,
    });
    return {
        ...(activity ? { activities: [activity] } : {}),
        computerId: config.computerId,
        frame: dreamStartFrame(
            {
                activeRunId: runId,
                activeRunModelId: config.desiredModelId,
                activeRunRuntimeId: config.desiredRuntimeId,
                agentId,
            },
            config,
            row
        ),
        serverId: state.serverId,
    };
}

/** The dream run's start frame, identical on first dispatch and every resend. */
export function dreamStartFrame(
    state: Pick<
        store.AgentDeliveryRow,
        'activeRunId' | 'activeRunModelId' | 'activeRunRuntimeId' | 'agentId'
    >,
    config: DreamFrameConfig,
    row: Pick<store.InboxItemRow, 'createdAt' | 'dedupeKey'>
): AgentCommand {
    return {
        agentId: state.agentId,
        ...startPromptFacts(config),
        agentName: config.agentName,
        chatId: null,
        dream: { createdAt: row.createdAt.toISOString(), id: row.dedupeKey },
        drainItemIds: [],
        homeTimezone: config.homeTimezone,
        inbox: [],
        inboxDelivery: 'concrete',
        modelId: state.activeRunModelId ?? '',
        runId: state.activeRunId ?? '',
        runtimeId: state.activeRunRuntimeId ?? '',
        sessionGeneration: config.sessionGeneration,
        totalPending: 0,
        type: 'start',
        unreadElsewhere: [],
        warmDrainItemIds: [],
    };
}
