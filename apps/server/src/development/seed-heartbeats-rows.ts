import type {
    agentDreamSummariesTable,
    agentDreamsTable,
    agentHeartbeatChecksTable,
    agentInboxTable,
    agentRunTriggersTable,
    agentTurnsTable,
    remindersTable,
} from '../postgres/schema.ts';
import type { createSeedClock } from './seed-heartbeats-clock.ts';
import { stableId } from './seed-heartbeats-clock.ts';
import type { HeartbeatPlan, Who } from './seed-heartbeats-plan.ts';
import type { InboxSeedContext } from './seed-inbox-context.ts';

const minute = 60_000;

export interface AgentExecution {
    modelId: string | null;
    runtimeId: string | null;
}

/** The post a main-session run made after reading a report. */
export interface HeartbeatPost {
    agentId: string;
    at: Date;
    id: string;
    nonce: string;
    reportRunId: string;
    text: string;
}

export interface HeartbeatRecords {
    checks: (typeof agentHeartbeatChecksTable.$inferInsert)[];
    dreams: (typeof agentDreamsTable.$inferInsert)[];
    inbox: (typeof agentInboxTable.$inferInsert)[];
    ownerMessage: { at: Date; id: string; nonce: string };
    posts: HeartbeatPost[];
    reminders: (typeof remindersTable.$inferInsert)[];
    summaries: (typeof agentDreamSummariesTable.$inferInsert)[];
    triggers: (typeof agentRunTriggersTable.$inferInsert)[];
    turns: (typeof agentTurnsTable.$inferInsert)[];
}

/** What every record builder reads: the resolved Agents, the clock, and the rows so far. */
export interface Scope {
    agents: ReadonlyMap<Who, string>;
    clock: ReturnType<typeof createSeedClock>;
    context: InboxSeedContext;
    execution: ReadonlyMap<Who, AgentExecution>;
    now: Date;
    records: HeartbeatRecords;
}

export const heartbeatDurationMs: Record<HeartbeatPlan['outcome'], number> = {
    failed: 1.2 * minute,
    quiet: 2.5 * minute,
    reported: 4 * minute,
    yielded: 1.5 * minute,
};

export const heartbeatTurnSummary: Record<HeartbeatPlan['outcome'], string> = {
    failed: 'Stopped before finishing the shop check.',
    quiet: 'Checked orders, ads, and stock; nothing worth interrupting anyone for.',
    reported: 'Checked the shop and filed what was worth a look.',
    yielded: 'Stopped to make room for a message addressed to the Agent.',
};

export function turnRow(
    shared: { context: InboxSeedContext; execution: ReadonlyMap<Who, AgentExecution> },
    turn: {
        agentId: string;
        endedAt: Date;
        failed?: boolean;
        interrupted?: boolean;
        produced: boolean;
        runId: string;
        startedAt: Date;
        summary: string;
        tokens: number;
        who: Who;
    }
): typeof agentTurnsTable.$inferInsert {
    const execution = shared.execution.get(turn.who);
    const outputTokens = Math.round(turn.tokens * 0.04);
    const inputTokens = Math.round(turn.tokens * 0.36);
    let status: 'completed' | 'failed' | 'interrupted' = 'completed';
    if (turn.failed) {
        status = 'failed';
    } else if (turn.interrupted) {
        status = 'interrupted';
    }
    return {
        agentId: turn.agentId,
        cacheReadTokens: turn.tokens - inputTokens - outputTokens,
        computerId: shared.context.computerId,
        endedAt: turn.endedAt,
        failureKind: turn.failed ? 'runtime-error' : null,
        id: stableId('atn', turn.runId),
        inputTokens,
        messageCount: 0,
        modelId: execution?.modelId ?? null,
        outputProduced: turn.produced,
        outputTokens,
        reportedAt: turn.endedAt,
        runId: turn.runId,
        runtimeId: execution?.runtimeId ?? null,
        serverId: shared.context.serverId,
        startedAt: turn.startedAt,
        status,
        summary: turn.summary,
        tokenUsageReported: true,
        totalTokens: turn.tokens,
    };
}

export function checkRow(
    serverId: string,
    check: {
        agentId: string;
        at: Date;
        key: string;
        kind: 'daytime' | 'nightly';
        localDate: string;
        outcome: 'paused' | 'queued' | 'skipped' | 'yielded';
        runId?: string;
        skipReason?: 'busy' | 'no-activity' | 'plan-limit';
        slot: string;
    }
): typeof agentHeartbeatChecksTable.$inferInsert {
    return {
        agentId: check.agentId,
        createdAt: check.at,
        id: stableId('hbc', check.key),
        kind: check.kind,
        localDate: check.localDate,
        outcome: check.outcome,
        runId: check.runId ?? null,
        serverId,
        skipReason: check.skipReason ?? null,
        slot: check.slot,
    };
}

/** The #shop channel's id is stable, so Reminders can anchor to it before it exists. */
export const shopChatId = stableId('cht', 'dev-shop');

/** Run ids are Server-unique, so each seeded run carries its Agent's id. */
export function runIdOf(agentId: string, key: string): string {
    return `run_dev_hb_${agentId}_${key}`;
}

export function agentOf(agents: ReadonlyMap<Who, string>, who: Who): string {
    const id = agents.get(who);
    if (!id) {
        throw new Error(`The development heartbeat seed has no Agent for ${who}.`);
    }
    return id;
}
