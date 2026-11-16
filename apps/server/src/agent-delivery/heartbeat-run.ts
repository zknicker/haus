import type { AgentCommand } from '@haus/api';
import { and, eq, isNull, lt, or } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { agentInboxTable, agentRunTriggersTable, agentsTable } from '../postgres/schema.ts';
import { appendServerAgentActivity } from '../server-agents/agent-activity.ts';
import { recordRunTrigger } from '../server-agents/record-agent-turn.ts';
import { decodeTaskAssignment } from '../tasks/task-assignment-envelope.ts';
import type { ConfiguredAgent } from './deferred-configuration.ts';
import type { DispatchPlan } from './delivery.ts';
import { type AgentDispatchConfig, startPromptFacts } from './dispatch-config.ts';
import { readHeartbeatContext } from './heartbeat-context.ts';
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

type ChatlessRow = Pick<store.InboxItemRow, 'content' | 'createdAt' | 'dedupeKey' | 'source'>;

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
 * Whether the Agent's main session holds background work (sub-agents or shells) its Computer
 * last reported. A dream or daytime heartbeat waits for it: its fresh session shares the
 * Agent's loopback proxy, so a turn the main session starts on its own when that work ends
 * would make `haus` calls as the heartbeat run (specs/heartbeat.md "Background work").
 */
export async function holdsBackgroundWork(db: HausDatabase, agentId: string): Promise<boolean> {
    const [row] = await db
        .select({ tasks: agentsTable.effectiveBackgroundTasks })
        .from(agentsTable)
        .where(eq(agentsTable.id, agentId));
    return (row?.tasks ?? 0) > 0;
}

/**
 * Prepares an idle Agent's drain: retires its stale heartbeats, then answers which queued rows
 * may lead now. A dream or daytime heartbeat (the runs that execute in a fresh session) waits
 * out the main session's background work; everything else drains past it. Applied to the
 * candidates and again to the admitted lead, since admission at the chain ceiling may widen to
 * a queued dream it was not offered.
 */
export async function heartbeatLeadGate(
    db: HausDatabase,
    agentId: string
): Promise<(row: Pick<store.InboxItemRow, 'source'>) => boolean> {
    await retireStaleHeartbeats(db, agentId);
    const holding = await holdsBackgroundWork(db, agentId);
    return (row) => !(holding && heartbeatKindOf(row.source) !== null);
}

/**
 * Starts the run a queued dream, heartbeat, heartbeat report, sub-agent wake, or
 * batch of Task assignments leads. Each is concrete work with no Chat, so its run
 * carries its attention alone: no inbox items, no Chat lifecycle event. Busy
 * notices, settlement, failure, and Stop treat it like any concrete run. Which
 * session it runs in is the attention's to say: only a dream or heartbeat opens a
 * throwaway one, and everything else resumes the main session.
 */
export async function planChatlessRun(
    tx: HausDatabase,
    input: {
        agentId: string;
        config: ConfiguredAgent;
        rows: store.InboxItemRow[];
        state: store.AgentDeliveryRow;
    }
): Promise<DispatchPlan> {
    const { agentId, config, state } = input;
    const runId = createOpaqueId('run');
    await store.attachQueuedItemsToRun(tx, {
        agentId,
        itemIds: input.rows.map((row) => row.id),
        runId,
    });
    // Reread in queue order, so this frame and every resend list the same rows alike.
    const rows = await store.listInboxItemsForRun(tx, { agentId, runId });
    const [lead] = rows;
    if (!lead) {
        throw new Error(`Chatless run ${runId} attached no inbox item.`);
    }
    await store.beginActiveRun(tx, {
        agentId,
        chatId: null,
        computerId: config.computerId,
        modelId: config.desiredModelId,
        reasoningEffort: config.desiredReasoningEffort,
        runId,
        runtimeId: config.desiredRuntimeId,
    });
    await recordRunTrigger(tx, { agentId, runId, serverId: state.serverId }, lead);
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
        frame: await chatlessStartFrame(
            tx,
            {
                activeRunId: runId,
                activeRunModelId: config.desiredModelId,
                activeRunRuntimeId: config.desiredRuntimeId,
                agentId,
                serverId: state.serverId,
            },
            config,
            rows
        ),
        serverId: state.serverId,
    };
}

/**
 * The chatless run's start frame, identical on first dispatch and every resend:
 * the digest is bounded by the run's own trigger time, not by when it is rebuilt.
 * `rows` is the run's whole attention: several only for Task assignments.
 */
export async function chatlessStartFrame(
    db: HausDatabase,
    state: Pick<
        store.AgentDeliveryRow,
        'activeRunId' | 'activeRunModelId' | 'activeRunRuntimeId' | 'agentId' | 'serverId'
    >,
    config: HeartbeatFrameConfig,
    rows: readonly ChatlessRow[]
): Promise<AgentCommand> {
    const runId = state.activeRunId ?? '';
    return {
        agentId: state.agentId,
        ...startPromptFacts(config),
        agentName: config.agentName,
        chatId: null,
        drainItemIds: [],
        ...(await attentionOf(db, state, rows)),
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
    rows: readonly ChatlessRow[]
) {
    const [row] = rows;
    if (!row) {
        throw new Error(`Chatless run ${state.activeRunId} carries no attention.`);
    }
    if (row.source === 'task_assignment') {
        return {
            taskAssignments: rows.map((assignment) => decodeTaskAssignment(assignment.content)),
        };
    }
    const createdAt = row.createdAt.toISOString();
    if (row.source === 'subagent') {
        // The runtime's own report is already in the conversation; the wake carries no body.
        return { subagentWake: { createdAt, id: row.dedupeKey } };
    }
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
            ...(await readHeartbeatContext(db, state)),
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
