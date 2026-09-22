import type { AgentTurnActivitySummary } from '@haus/api';
import type { AgentInboxItem } from './agent-inbox-item.ts';
import type { RuntimeFailureKind } from './runtime-failure.ts';

/** Server→Computer launch command kept local so the Computer artifact is self-contained. */
export interface AgentStartCommand {
    /** Server-owned Agent facts the Computer composes into the system prompt. */
    agentDescription?: string;
    agentId: string;
    agentName?: string;
    chatId: string;
    /** Drainable on any start: concrete work, and human work addressed to this Agent. */
    drainItemIds?: string[];
    homeTimezone?: string;
    inbox?: AgentInboxItem[];
    inboxDelivery: 'concrete' | 'notice';
    modelId: string;
    runId: string;
    runtimeId: string;
    sessionGeneration: number;
    totalPending: number;
    traceContext?: { traceparent: string };
    type: 'start';
    /** Queued work in chats no row of this frame represents. Counts advance nothing. */
    unreadElsewhere?: UnreadElsewhere[];
    /** Additionally drainable when the harness session resumes: alive-idle parity. */
    warmDrainItemIds?: string[];
    webAccess?: 'fetch-only' | 'search' | 'search-only';
}

/** One chat holding queued work no row of the current frame represents. */
export interface UnreadElsewhere {
    count: number;
    target: string;
}

/** Server→Computer command to terminate the named in-flight run. */
export interface AgentStopCommand {
    agentId: string;
    runId: string;
    type: 'stop';
}

/** Server→Computer command to refresh instructions without rotating context. */
export interface AgentRestartCommand {
    agentId: string;
    type: 'agent-restart';
}

/** Server→Computer command to rotate one Agent's local execution state. */
export interface AgentResetCommand {
    agentId: string;
    kind: 'full' | 'session';
    sessionGeneration: number;
    type: 'agent-reset';
}

/** Server→Computer notice that a busy Agent has queued work. */
export interface AgentNoticeCommand {
    agentId: string;
    inbox: AgentInboxItem[];
    runId: string;
    totalPending: number;
    type: 'notice';
    unreadElsewhere?: UnreadElsewhere[];
}

/** Server-scoped instruction to erase this attachment's local partition. */
export interface ServerDeleteCommand {
    type: 'server-delete';
}

/** The compact turn summary the Computer pushes up after a launch settles. */
export interface AgentTurnFrame {
    activity: AgentTurnActivitySummary;
    agentId: string;
    endedAt: string;
    failureKind?: RuntimeFailureKind;
    messageCount: number;
    modelId: string;
    /** Whether the turn produced any durable send — governs safe requeue. */
    outputProduced: boolean;
    runId: string;
    runtimeId: string;
    startedAt: string;
    status: 'completed' | 'failed' | 'interrupted';
    summary: string;
    tokenUsage: {
        cacheReadTokens: number;
        cacheWriteTokens: number;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
    } | null;
    type: 'turn';
    visibleMessages: Array<{ chatId: string; id: string; sequence: number }>;
}
