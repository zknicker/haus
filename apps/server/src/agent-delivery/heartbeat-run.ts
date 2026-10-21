import type { AgentCommand } from '@haus/api';
import { and, eq, isNull, lt, or } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { agentInboxTable, agentRunTriggersTable } from '../postgres/schema.ts';
import { appendServerAgentActivity } from '../server-agents/agent-activity.ts';
import { recordRunTrigger } from '../server-agents/record-agent-turn.ts';
import type { ConfiguredAgent } from './deferred-configuration.ts';
import type { DispatchPlan } from './delivery.ts';
import { type AgentDispatchConfig, startPromptFacts } from './dispatch-config.ts';
import { buildHeartbeatDigest, heartbeatKindOf, readHeartbeatSince } from './heartbeat-digest.ts';
import { heartbeatRunIdOfReport } from './heartbeat-keys.ts';
import * as store from './store.ts';

type HeartbeatFrameConfig = Pick<
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
/** A daytime heartbeat that cannot start this soon is retired: a missed slot is not made up. */
export const heartbeatStaleMs = 30 * 60 * 1000;

/**
 * Retires an Agent's stale queued dreams and daytime heartbeats as `seen`,
 * keeping their dedupe identity. Everything else about them is ordinary
 * concrete inbox handling.
 */
export async function retireStaleHeartbeats(db: HausDatabase, agentId: string): Promise<void> {
    const queued = and(
        eq(agentInboxTable.agentId, agentId),
        eq(agentInboxTable.state, 'queued'),
        isNull(agentInboxTable.runId)
    );
    const now = Date.now();
    await db
        .update(agentInboxTable)
        .set({ seenAt: new Date(), state: 'seen' })
        .where(
            and(
                queued,
                or(
                    and(
                        eq(agentInboxTable.source, 'dream'),
                        lt(agentInboxTable.createdAt, new Date(now - dreamStaleMs))
                    ),
                    and(
                        eq(agentInboxTable.source, 'heartbeat'),
                        lt(agentInboxTable.createdAt, new Date(now - heartbeatStaleMs))
                    )
                )
            )
        );
}

/**
 * Starts the run a queued dream, heartbeat, or heartbeat report leads. Each is
 * concrete work with no Chat, so its run carries it alone: no inbox items, no
 * Chat lifecycle event. Busy notices, settlement, failure, and Stop treat it
 * like any concrete run.
 */
export async function planHeartbeatRun(
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
        frame: await heartbeatStartFrame(
            tx,
            {
                activeRunId: runId,
                activeRunModelId: config.desiredModelId,
                activeRunRuntimeId: config.desiredRuntimeId,
                agentId,
                serverId: state.serverId,
            },
            config,
            row
        ),
        serverId: state.serverId,
    };
}

/**
 * The chatless run's start frame, identical on first dispatch and every resend:
 * the digest is bounded by the run's own trigger time, not by when it is rebuilt.
 */
export async function heartbeatStartFrame(
    db: HausDatabase,
    state: Pick<
        store.AgentDeliveryRow,
        'activeRunId' | 'activeRunModelId' | 'activeRunRuntimeId' | 'agentId' | 'serverId'
    >,
    config: HeartbeatFrameConfig,
    row: Pick<store.InboxItemRow, 'content' | 'createdAt' | 'dedupeKey' | 'source'>
): Promise<AgentCommand> {
    const runId = state.activeRunId ?? '';
    return {
        agentId: state.agentId,
        ...startPromptFacts(config),
        agentName: config.agentName,
        chatId: null,
        drainItemIds: [],
        ...(await attentionOf(db, state, row)),
        homeTimezone: config.homeTimezone,
        inbox: [],
        inboxDelivery: 'concrete',
        modelId: state.activeRunModelId ?? '',
        runId,
        runtimeId: state.activeRunRuntimeId ?? '',
        sessionGeneration: config.sessionGeneration,
        totalPending: 0,
        type: 'start',
        unreadElsewhere: [],
        warmDrainItemIds: [],
    };
}

async function attentionOf(
    db: HausDatabase,
    state: Pick<store.AgentDeliveryRow, 'activeRunId' | 'agentId' | 'serverId'>,
    row: Pick<store.InboxItemRow, 'content' | 'createdAt' | 'dedupeKey' | 'source'>
) {
    const createdAt = row.createdAt.toISOString();
    const kind = heartbeatKindOf(row.source);
    if (!kind) {
        const heartbeatRunId = heartbeatRunIdOfReport(row.dedupeKey);
        const [filedBy] = await db
            .select({ source: agentRunTriggersTable.source })
            .from(agentRunTriggersTable)
            .where(
                and(
                    eq(agentRunTriggersTable.serverId, state.serverId),
                    eq(agentRunTriggersTable.agentId, state.agentId),
                    eq(agentRunTriggersTable.runId, heartbeatRunId)
                )
            );
        return {
            heartbeatReport: {
                createdAt,
                heartbeatKind:
                    filedBy?.source === 'dream' ? ('nightly' as const) : ('daytime' as const),
                heartbeatRunId,
                id: row.dedupeKey,
                text: row.content,
            },
        };
    }
    const runId = state.activeRunId ?? '';
    const [trigger] = await db
        .select({ at: agentRunTriggersTable.createdAt })
        .from(agentRunTriggersTable)
        .where(
            and(
                eq(agentRunTriggersTable.serverId, state.serverId),
                eq(agentRunTriggersTable.agentId, state.agentId),
                eq(agentRunTriggersTable.runId, runId)
            )
        );
    const since = await readHeartbeatSince(db, {
        agentId: state.agentId,
        kind,
        runId,
        serverId: state.serverId,
    });
    return {
        heartbeat: {
            createdAt,
            digest: await buildHeartbeatDigest(db, {
                agentId: state.agentId,
                serverId: state.serverId,
                since,
                until: trigger?.at ?? row.createdAt,
            }),
            id: row.dedupeKey,
            kind,
            since: since?.toISOString() ?? null,
        },
    };
}
