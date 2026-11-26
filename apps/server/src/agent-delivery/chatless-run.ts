import type { AgentCommand, AgentStartCommand, chatlessInboxSources } from '@haus/api';
import { decodeProcessExit } from '../agent-invocations/process-exits.ts';
import { decodeDriveConflict } from '../drive/conflict-item.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { appendServerAgentActivity } from '../server-agents/agent-activity.ts';
import { recordRunTrigger } from '../server-agents/record-agent-turn.ts';
import { decodeTaskAssignment } from '../tasks/task-assignment-envelope.ts';
import type { ConfiguredAgent } from './deferred-configuration.ts';
import type { DispatchPlan } from './delivery.ts';
import { type AgentDispatchConfig, startPromptFacts } from './dispatch-config.ts';
import { startRun } from './run-start.ts';
import * as store from './store.ts';

type ChatlessFrameConfig = Pick<
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

/**
 * Starts the run a queued sub-agent wake, Drive conflict, process exit, or batch of Task
 * assignments leads. Each
 * is concrete work with no Chat, so its run carries its attention alone: no inbox
 * items, no Chat lifecycle event. Busy notices, settlement, failure, and Stop treat
 * it like any concrete run, and it resumes the main session.
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
    const startEvents = await startRun(tx, {
        agentId,
        chatId: null,
        computerId: config.computerId,
        modelId: config.desiredModelId,
        reasoningEffort: config.desiredReasoningEffort,
        runId,
        runtimeId: config.desiredRuntimeId,
        serverId: state.serverId,
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
        startEvents,
        frame: chatlessStartFrame(
            {
                activeRunId: runId,
                activeRunModelId: config.desiredModelId,
                activeRunRuntimeId: config.desiredRuntimeId,
                agentId,
            },
            config,
            rows
        ),
        serverId: state.serverId,
    };
}

/**
 * The chatless run's start frame, identical on first dispatch and every resend.
 * `rows` is the run's whole attention: several only for Task assignments.
 */
export function chatlessStartFrame(
    state: Pick<
        store.AgentDeliveryRow,
        'activeRunId' | 'activeRunModelId' | 'activeRunRuntimeId' | 'agentId'
    >,
    config: ChatlessFrameConfig,
    rows: readonly ChatlessRow[]
): AgentCommand {
    return {
        agentId: state.agentId,
        ...startPromptFacts(config),
        agentName: config.agentName,
        chatId: null,
        drainItemIds: [],
        ...chatlessAttention(state, rows),
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

type ChatlessAttention = Pick<
    AgentStartCommand,
    'driveConflict' | 'processExit' | 'subagentWake' | 'taskAssignments'
>;

type ChatlessSource = (typeof chatlessInboxSources)[number];

const chatlessAttentions: Record<
    ChatlessSource,
    (rows: readonly [ChatlessRow, ...ChatlessRow[]]) => ChatlessAttention
> = {
    drive_conflict: ([row]) => ({ driveConflict: decodeDriveConflict(row.content) }),
    process_exit: ([row]) => ({ processExit: decodeProcessExit(row.content) }),
    // The runtime's own report is already in the conversation; the wake carries no body.
    subagent: ([row]) => ({
        subagentWake: { createdAt: row.createdAt.toISOString(), id: row.dedupeKey },
    }),
    task_assignment: (rows) => ({
        taskAssignments: rows.map((assignment) => decodeTaskAssignment(assignment.content)),
    }),
};

/** A chatless run's attention, decoded from its rows; throws when they cannot render. */
export function chatlessAttention(
    state: Pick<store.AgentDeliveryRow, 'activeRunId'>,
    rows: readonly ChatlessRow[]
) {
    const [row, ...rest] = rows;
    if (!row) {
        throw new Error(`Chatless run ${state.activeRunId} carries no attention.`);
    }
    if (!isChatlessSource(row.source)) {
        throw new Error(`Chatless run ${state.activeRunId} has no attention for ${row.source}.`);
    }
    return chatlessAttentions[row.source]([row, ...rest]);
}

function isChatlessSource(source: string): source is ChatlessSource {
    return Object.hasOwn(chatlessAttentions, source);
}
