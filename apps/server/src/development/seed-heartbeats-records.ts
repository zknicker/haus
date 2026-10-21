import { heartbeatDedupeKey, heartbeatReportDedupeKey } from '../agent-delivery/heartbeat-keys.ts';
import { createSeedClock, localDateOf, stableId } from './seed-heartbeats-clock.ts';
import { addDream } from './seed-heartbeats-dreams.ts';
import {
    checkPlans,
    dreamPlans,
    type HeartbeatPlan,
    heartbeatPlans,
    ownerContextMessage,
    type Who,
} from './seed-heartbeats-plan.ts';
import {
    type AgentExecution,
    agentOf,
    checkRow,
    type HeartbeatRecords,
    heartbeatDurationMs,
    heartbeatTurnSummary,
    runIdOf,
    type Scope,
    turnRow,
} from './seed-heartbeats-rows.ts';
import type { InboxSeedContext } from './seed-inbox-context.ts';

const minute = 60_000;

/**
 * Every row the Activity Heartbeats feed reads, shaped the way the product writes it
 * and keyed by stable ids, so a refresh replaces rather than duplicates. Pure: the
 * caller owns the database.
 */
export function buildHeartbeatRecords(input: {
    agents: ReadonlyMap<Who, string>;
    context: InboxSeedContext;
    execution: ReadonlyMap<Who, AgentExecution>;
    now: Date;
}): HeartbeatRecords {
    const clock = createSeedClock(input.now);
    const records: HeartbeatRecords = {
        checks: [],
        dreams: [],
        inbox: [],
        ownerMessage: {
            at: clock(ownerContextMessage.day, ownerContextMessage.time),
            id: stableId('msg', ownerContextMessage.nonce),
            nonce: ownerContextMessage.nonce,
        },
        posts: [],
        reminders: [],
        summaries: [],
        triggers: [],
        turns: [],
    };
    const scope: Scope = { ...input, clock, records };
    for (const plan of heartbeatPlans) {
        addHeartbeat(scope, plan);
    }
    for (const plan of dreamPlans) {
        addDream(scope, plan);
    }
    for (const plan of checkPlans) {
        const at = clock(plan.day, plan.time);
        records.checks.push(
            checkRow(input.context.serverId, {
                agentId: agentOf(input.agents, plan.who),
                at,
                key: `${plan.key}:${plan.outcome}`,
                kind: 'daytime',
                localDate: localDateOf(at),
                outcome: plan.outcome,
                skipReason: plan.skipReason,
                slot: plan.time,
            })
        );
    }
    return records;
}

function addHeartbeat(scope: Scope, plan: HeartbeatPlan) {
    const { context, records } = scope;
    const agentId = agentOf(scope.agents, plan.who);
    const startedAt = scope.clock(plan.day, plan.time);
    const endedAt = new Date(startedAt.getTime() + heartbeatDurationMs[plan.outcome]);
    const localDate = localDateOf(startedAt);
    const runId = runIdOf(agentId, plan.key);
    records.triggers.push({
        agentId,
        createdAt: startedAt,
        runId,
        serverId: context.serverId,
        source: 'heartbeat',
        workId: heartbeatDedupeKey(agentId, localDate, plan.time),
    });
    records.turns.push(
        turnRow(scope, {
            agentId,
            endedAt,
            failed: plan.outcome === 'failed',
            interrupted: plan.outcome === 'yielded',
            produced: plan.outcome === 'reported',
            runId,
            startedAt,
            summary: heartbeatTurnSummary[plan.outcome],
            tokens: plan.tokens,
            who: plan.who,
        })
    );
    records.checks.push(
        checkRow(context.serverId, {
            agentId,
            at: startedAt,
            key: `${plan.key}:queued`,
            kind: 'daytime',
            localDate,
            outcome: 'queued',
            slot: plan.time,
        })
    );
    if (plan.outcome === 'yielded') {
        records.checks.push(
            checkRow(context.serverId, {
                agentId,
                at: endedAt,
                key: `${plan.key}:yielded`,
                kind: 'daytime',
                localDate,
                outcome: 'yielded',
                runId,
                slot: plan.time,
            })
        );
    }
    if (plan.report) {
        addReport(scope, { ...plan, report: plan.report }, { agentId, endedAt, runId });
    }
}

/** The report a run filed, the main-session run that read it, and the post it made. */
function addReport(
    scope: Scope,
    plan: HeartbeatPlan & { report: NonNullable<HeartbeatPlan['report']> },
    run: { agentId: string; endedAt: Date; runId: string }
) {
    const { context, records } = scope;
    const reportRunId = `run_dev_hbr_${run.agentId}_${plan.key}`;
    const readAt = new Date(run.endedAt.getTime() + 1.5 * minute);
    const dedupeKey = heartbeatReportDedupeKey(run.runId);
    records.triggers.push({
        agentId: run.agentId,
        createdAt: readAt,
        runId: reportRunId,
        serverId: context.serverId,
        source: 'heartbeat_report',
        workId: dedupeKey,
    });
    records.inbox.push({
        acceptedAt: readAt,
        agentId: run.agentId,
        chatId: null,
        content: plan.report.text,
        createdAt: run.endedAt,
        dedupeKey,
        id: stableId('inb', dedupeKey),
        runId: reportRunId,
        seenAt: readAt,
        servedAt: readAt,
        serverId: context.serverId,
        settledRunId: reportRunId,
        source: 'heartbeat_report',
        state: 'seen',
    });
    if (plan.report.post) {
        const nonce = `dev-hb-post-${plan.key}`;
        records.posts.push({
            agentId: run.agentId,
            at: new Date(readAt.getTime() + 2 * minute),
            id: stableId('msg', nonce),
            nonce,
            reportRunId,
            text: plan.report.post.text,
        });
    }
}
