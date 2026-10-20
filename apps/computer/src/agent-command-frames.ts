import { agentHeartbeatAttentionSchema, agentHeartbeatReportAttentionSchema } from '@haus/api';
import type {
    AgentNoticeCommand,
    AgentResetCommand,
    AgentRestartCommand,
    AgentStartCommand,
    AgentStopCommand,
    ServerDeleteCommand,
} from './agent-commands.ts';
import { parseDrainItemIds, parseInbox, parseUnreadElsewhere } from './agent-inbox-input.ts';
import { parseTurnTraceContext } from './agent-turn-telemetry.ts';
import { parseStartAgentFacts } from './start-command-facts.ts';

// Server→Computer command frame validation. Every parser fails closed to null.

/** Validates a Server→Computer frame as a launch command. Fails closed to null. */
export function parseStartCommand(frame: unknown): AgentStartCommand | null {
    if (!isRecord(frame) || frame.type !== 'start') {
        return null;
    }
    const idFields = ['agentId', 'modelId', 'runId', 'runtimeId'] as const;
    for (const field of idFields) {
        if (typeof frame[field] !== 'string' || (frame[field] as string).length === 0) {
            return null;
        }
    }
    const inbox = parseInbox(frame.inbox);
    const drainItemIds = parseDrainItemIds(frame.drainItemIds);
    const warmDrainItemIds = parseDrainItemIds(frame.warmDrainItemIds);
    const unreadElsewhere = parseUnreadElsewhere(frame.unreadElsewhere);
    if (!(inbox && drainItemIds && warmDrainItemIds && unreadElsewhere)) {
        return null;
    }
    const runChat = parseRunChat(
        frame,
        inbox.length + drainItemIds.length + warmDrainItemIds.length
    );
    if (!runChat) {
        return null;
    }
    if (
        typeof frame.sessionGeneration !== 'number' ||
        !Number.isInteger(frame.sessionGeneration) ||
        frame.sessionGeneration < 1
    ) {
        return null;
    }
    if (
        !['concrete', 'notice'].includes(frame.inboxDelivery as string) ||
        typeof frame.totalPending !== 'number' ||
        !Number.isInteger(frame.totalPending) ||
        frame.totalPending < 0
    ) {
        return null;
    }
    const facts = parseStartAgentFacts(frame);
    if (!facts) {
        return null;
    }
    const traceContext = parseTurnTraceContext(frame.traceContext);
    if (frame.traceContext !== undefined && !traceContext) {
        return null;
    }
    return {
        ...facts,
        agentId: frame.agentId as string,
        ...runChat,
        drainItemIds,
        inbox,
        inboxDelivery: frame.inboxDelivery as 'concrete' | 'notice',
        modelId: frame.modelId as string,
        runId: frame.runId as string,
        runtimeId: frame.runtimeId as string,
        sessionGeneration: frame.sessionGeneration,
        totalPending: frame.totalPending,
        ...(traceContext ? { traceContext } : {}),
        type: 'start',
        unreadElsewhere,
        warmDrainItemIds,
    };
}

/** Validates a Server→Computer frame as a stop command. Fails closed to null. */
export function parseStopCommand(frame: unknown): AgentStopCommand | null {
    if (
        !isRecord(frame) ||
        frame.type !== 'stop' ||
        typeof frame.agentId !== 'string' ||
        frame.agentId.length === 0 ||
        typeof frame.runId !== 'string' ||
        frame.runId.length === 0
    ) {
        return null;
    }
    return { agentId: frame.agentId, runId: frame.runId, type: 'stop' };
}

/** Validates a Server→Computer restart command. Fails closed to null. */
export function parseRestartCommand(frame: unknown): AgentRestartCommand | null {
    if (
        !isRecord(frame) ||
        frame.type !== 'agent-restart' ||
        typeof frame.agentId !== 'string' ||
        frame.agentId.length === 0
    ) {
        return null;
    }
    return { agentId: frame.agentId, type: 'agent-restart' };
}

/** Validates a Server→Computer reset command. Fails closed to null. */
export function parseResetCommand(frame: unknown): AgentResetCommand | null {
    if (
        !isRecord(frame) ||
        frame.type !== 'agent-reset' ||
        typeof frame.agentId !== 'string' ||
        frame.agentId.length === 0 ||
        !['full', 'session'].includes(frame.kind as string) ||
        typeof frame.sessionGeneration !== 'number' ||
        !Number.isInteger(frame.sessionGeneration) ||
        frame.sessionGeneration < 1
    ) {
        return null;
    }
    return {
        agentId: frame.agentId,
        kind: frame.kind as 'full' | 'session',
        sessionGeneration: frame.sessionGeneration,
        type: 'agent-reset',
    };
}

/** Validates a Server→Computer busy-inbox snapshot. Fails closed to null. */
export function parseNoticeCommand(frame: unknown): AgentNoticeCommand | null {
    if (
        !isRecord(frame) ||
        frame.type !== 'notice' ||
        typeof frame.agentId !== 'string' ||
        frame.agentId.length === 0 ||
        typeof frame.runId !== 'string' ||
        frame.runId.length === 0 ||
        typeof frame.totalPending !== 'number' ||
        !Number.isInteger(frame.totalPending) ||
        frame.totalPending < 1 ||
        !parseInbox(frame.inbox)?.length
    ) {
        return null;
    }
    const unreadElsewhere = parseUnreadElsewhere(frame.unreadElsewhere);
    if (!unreadElsewhere) {
        return null;
    }
    return {
        agentId: frame.agentId,
        inbox: parseInbox(frame.inbox) ?? [],
        runId: frame.runId,
        totalPending: frame.totalPending,
        type: 'notice',
        unreadElsewhere,
    };
}

export function parseServerDeleteCommand(frame: unknown): ServerDeleteCommand | null {
    return isRecord(frame) && frame.type === 'server-delete' && Object.keys(frame).length === 1
        ? { type: 'server-delete' }
        : null;
}

/** Only a heartbeat or report run is chatless, and it carries nothing but its attention. */
function parseRunChat(
    frame: Record<string, unknown>,
    itemCount: number
): Pick<AgentStartCommand, 'chatId' | 'heartbeat' | 'heartbeatReport'> | null {
    if (frame.heartbeat === undefined && frame.heartbeatReport === undefined) {
        return typeof frame.chatId === 'string' && frame.chatId.length > 0
            ? { chatId: frame.chatId }
            : null;
    }
    if (frame.heartbeat !== undefined && frame.heartbeatReport !== undefined) {
        return null;
    }
    if (frame.chatId !== null || frame.inboxDelivery !== 'concrete' || itemCount !== 0) {
        return null;
    }
    if (frame.heartbeat !== undefined) {
        const heartbeat = agentHeartbeatAttentionSchema.safeParse(frame.heartbeat);
        return heartbeat.success ? { chatId: null, heartbeat: heartbeat.data } : null;
    }
    const report = agentHeartbeatReportAttentionSchema.safeParse(frame.heartbeatReport);
    return report.success ? { chatId: null, heartbeatReport: report.data } : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
