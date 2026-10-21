import type {
    AgentHeartbeats,
    AgentHeartbeatsInput,
    HeartbeatLane,
    HeartbeatMark,
} from '@haus/api';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { type DreamRunWindow, readDreamFacts } from './heartbeat-dream-facts.ts';
import { readHeartbeatPlanShares } from './heartbeat-plan-shares.ts';
import {
    readReports,
    readWindowChecks,
    readWindowRuns,
    type WindowCheck,
    type WindowRun,
} from './heartbeat-run-reads.ts';

const maxWindowMs = 31 * 24 * 60 * 60 * 1000;

/**
 * The Activity Heartbeats view: each shown Agent's heartbeat and dream marks in
 * `[from, to)`, with the day's counts and what the plans' weekly meters spent on
 * them. Any member sees every Agent, as `agent.serverTurns` allows; Chat ids in
 * `report.postedChatId` are limited to Chats the viewer can see. Marks come from
 * runs (`agent_run_triggers` joined to `agent_turns`) and from the decisions the
 * Server recorded (`agent_heartbeat_checks`). About a dozen bounded reads for the
 * whole window, none per Agent.
 *
 * Plan shares are estimates; see {@link readHeartbeatPlanShares}.
 */
export async function readAgentHeartbeats(
    db: HausDatabase,
    member: HausUser | null,
    input: AgentHeartbeatsInput
): Promise<AgentHeartbeats> {
    await requireServerMembership(db, member, input.serverId);
    const from = new Date(input.from);
    const to = new Date(input.to);
    const agents = await readShownAgents(db, input);
    const agentIds = agents.map((agent) => agent.id);
    if (agentIds.length === 0 || !(from < to) || to.getTime() - from.getTime() > maxWindowMs) {
        return emptyHeartbeats(agentIds);
    }
    const window = { agentIds, from, serverId: input.serverId, to };
    const [runs, { checks, yieldedStarts }] = await Promise.all([
        readWindowRuns(db, window),
        readWindowChecks(db, window),
    ]);
    const yielded = new Map(checks.flatMap((check) => (check.runId ? [[check.runId, check]] : [])));
    // A yielded run whose turn did not land in the window still holds its own mark.
    const runIds = [...new Set([...runs.map((run) => run.runId), ...yieldedStarts.keys()])];
    const dreams = runs.filter((run) => run.kind === 'nightly' && run.status !== null);
    const [reports, dreamFacts, plans] = await Promise.all([
        readReports(db, { ...window, runIds, userId: member?.id ?? '' }),
        readDreamFacts(db, input.serverId, dreams.map(toDreamWindow)),
        readHeartbeatPlanShares(
            db,
            input.serverId,
            agents.map((agent) => ({ computerId: agent.computerId, runtimeId: agent.runtimeId }))
        ),
    ]);

    const marksByAgent = new Map<string, HeartbeatMark[]>();
    const push = (agentId: string, mark: HeartbeatMark) =>
        marksByAgent.set(agentId, [...(marksByAgent.get(agentId) ?? []), mark]);
    for (const run of runs) {
        const mark = toRunMark(run, {
            dream: dreamFacts.get(run.runId)?.facts ?? null,
            report: reports.get(run.runId) ?? null,
            yielded: yielded.has(run.runId),
        });
        push(run.agentId, mark);
    }
    const runIdsMarked = new Set(runs.map((run) => run.runId));
    for (const check of checks) {
        if (check.runId && !runIdsMarked.has(check.runId)) {
            push(check.agentId, toYieldedMark(check, yieldedStarts, reports));
        } else if (!check.runId) {
            push(check.agentId, toSkippedMark(check));
        }
    }

    const lanes: HeartbeatLane[] = agentIds.map((agentId) => {
        const marks = (marksByAgent.get(agentId) ?? []).sort((left, right) =>
            left.at.localeCompare(right.at)
        );
        return {
            agentId,
            marks,
            tokens: marks.reduce((total, mark) => total + (mark.tokens ?? 0), 0),
        };
    });
    const allMarks = lanes.flatMap((lane) => lane.marks);
    return {
        lanes,
        summary: {
            followUps: sumOf(allMarks, (mark) => mark.dream?.followUps ?? 0),
            paused: count(allMarks, 'paused'),
            plans,
            posts: sumOf(allMarks, (mark) => (mark.report?.postedChatId ? 1 : 0)),
            reported: count(allMarks, 'reported'),
            rulesLearned: sumOf(runs, (run) => dreamFacts.get(run.runId)?.rulesLearned ?? 0),
            runs: allMarks.filter((mark) => mark.runId !== null).length,
            skipped: count(allMarks, 'skipped'),
            yielded: count(allMarks, 'yielded'),
        },
    };
}

async function readShownAgents(db: HausDatabase, input: AgentHeartbeatsInput) {
    return await db
        .select({
            computerId: agentsTable.computerId,
            id: agentsTable.id,
            runtimeId: agentsTable.desiredRuntimeId,
        })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, input.serverId),
                isNull(agentsTable.retiredAt),
                input.agentIds ? inArray(agentsTable.id, input.agentIds) : undefined
            )
        )
        .orderBy(asc(agentsTable.createdAt), asc(agentsTable.id));
}

function emptyHeartbeats(agentIds: readonly string[]): AgentHeartbeats {
    return {
        lanes: agentIds.map((agentId) => ({ agentId, marks: [], tokens: 0 })),
        summary: {
            followUps: 0,
            paused: 0,
            plans: [],
            posts: 0,
            reported: 0,
            rulesLearned: 0,
            runs: 0,
            skipped: 0,
            yielded: 0,
        },
    };
}

/** A run that started: running, failed, yielded, reported, or quiet, in that order of precedence. */
function toRunMark(
    run: WindowRun,
    facts: {
        dream: HeartbeatMark['dream'];
        report: HeartbeatMark['report'];
        yielded: boolean;
    }
): HeartbeatMark {
    const settled = run.status !== null;
    const report = settled ? facts.report : null;
    return {
        at: run.startedAt.toISOString(),
        dream: run.kind === 'nightly' && settled ? (facts.dream ?? zeroDream) : null,
        durationMs: run.durationMs,
        kind: run.kind,
        outcome: runOutcome(run, facts.yielded, report !== null),
        report,
        runId: run.runId,
        skipReason: null,
        tokens: run.tokens,
    };
}

const zeroDream = {
    added: 0,
    followUpTitles: [],
    followUps: 0,
    removed: 0,
    summary: null,
    summaryLine: null,
};

/**
 * `interrupted` turns count as `failed`: a heartbeat the Server did not stop to
 * make room (that is `yielded`) ended without finishing.
 */
function runOutcome(run: WindowRun, yielded: boolean, reported: boolean): HeartbeatMark['outcome'] {
    if (yielded) {
        return 'yielded';
    }
    if (run.status === null) {
        return 'running';
    }
    if (run.status !== 'completed') {
        return 'failed';
    }
    return reported ? 'reported' : 'quiet';
}

function toYieldedMark(
    check: WindowCheck,
    starts: ReadonlyMap<string, Date>,
    reports: ReadonlyMap<string, NonNullable<HeartbeatMark['report']>>
): HeartbeatMark {
    return {
        at: (starts.get(check.runId ?? '') ?? check.createdAt).toISOString(),
        dream: null,
        durationMs: null,
        kind: 'daytime',
        outcome: 'yielded',
        report: reports.get(check.runId ?? '') ?? null,
        runId: check.runId,
        skipReason: null,
        tokens: null,
    };
}

function toSkippedMark(check: WindowCheck): HeartbeatMark {
    return {
        at: check.createdAt.toISOString(),
        dream: null,
        durationMs: null,
        kind: check.kind,
        outcome: check.outcome === 'paused' ? 'paused' : 'skipped',
        report: null,
        runId: null,
        skipReason: check.skipReason,
        tokens: null,
    };
}

function toDreamWindow(run: WindowRun): DreamRunWindow {
    return {
        agentId: run.agentId,
        endedAt:
            run.durationMs === null ? null : new Date(run.startedAt.getTime() + run.durationMs),
        runId: run.runId,
        startedAt: run.startedAt,
    };
}

function count(marks: readonly HeartbeatMark[], outcome: HeartbeatMark['outcome']): number {
    return marks.filter((mark) => mark.outcome === outcome).length;
}

function sumOf<Item>(items: readonly Item[], value: (item: Item) => number): number {
    return items.reduce((total, item) => total + value(item), 0);
}
