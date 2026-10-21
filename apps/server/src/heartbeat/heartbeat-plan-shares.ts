import type { HeartbeatPlanShare, UsageOverview } from '@haus/api';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentRunTriggersTable, agentTurnsTable, computersTable } from '../postgres/schema.ts';

const dayMs = 24 * 60 * 60 * 1000;
const weekMs = 7 * dayMs;

interface WeeklyMeter {
    label: string;
    resetsAt: Date | null;
    usedPercent: number;
}

export interface PlanAgent {
    computerId: string | null;
    runtimeId: string | null;
}

/**
 * Heartbeat and dream cost on each plan the shown Agents bill against, as an
 * estimate: the plan's weekly meter utilization split by token share. The share is
 * this plan week's heartbeat (or dream) tokens over every token the Server's
 * Agents spent on that Computer and runtime in the same week, counted from
 * `agent_turns`. The week starts one week before the meter's reset time (the last
 * seven days when the meter reports none), so the split is only as exact as that
 * attribution: other work on the plan, outside this Server, is part of
 * `usedPercent` but not of the denominator's tokens. A runtime on several Computers
 * reports the one whose meter is fullest, since that plan binds first. Runtimes
 * with no weekly meter (or no snapshot) have no entry.
 */
export async function readHeartbeatPlanShares(
    db: HausDatabase,
    serverId: string,
    agents: readonly PlanAgent[],
    now: Date = new Date()
): Promise<HeartbeatPlanShare[]> {
    const pairs = distinctPairs(agents);
    if (pairs.length === 0) {
        return [];
    }
    const computers = await db
        .select({ id: computersTable.id, usage: computersTable.usageSnapshot })
        .from(computersTable)
        .where(
            and(
                eq(computersTable.serverId, serverId),
                inArray(
                    computersTable.id,
                    pairs.map((pair) => pair.computerId)
                )
            )
        );
    const usageOf = new Map(computers.map((computer) => [computer.id, computer.usage]));
    const metered = pairs.flatMap((pair) => {
        const meter = weeklyMeter(usageOf.get(pair.computerId) ?? null, pair.runtimeId);
        return meter ? [{ ...pair, meter }] : [];
    });
    const tokens = await Promise.all(
        metered.map((pair) => readWeekTokens(db, serverId, pair, weekStart(pair.meter, now)))
    );
    const best = new Map<string, HeartbeatPlanShare>();
    for (const [index, pair] of metered.entries()) {
        const share = toShare(pair.runtimeId, pair.meter, tokens[index] ?? emptyTokens);
        const current = best.get(pair.runtimeId);
        if (!current || share.usedPercent > current.usedPercent) {
            best.set(pair.runtimeId, share);
        }
    }
    return [...best.values()].sort((left, right) => left.runtimeId.localeCompare(right.runtimeId));
}

interface WeekTokens {
    dream: number;
    heartbeat: number;
    total: number;
}

const emptyTokens: WeekTokens = { dream: 0, heartbeat: 0, total: 0 };

async function readWeekTokens(
    db: HausDatabase,
    serverId: string,
    pair: { computerId: string; runtimeId: string },
    since: Date
): Promise<WeekTokens> {
    const [row] = await db
        .select({
            dream: sql<string>`coalesce(sum(${agentTurnsTable.totalTokens}) filter (where ${agentRunTriggersTable.source} = 'dream'), 0)`,
            heartbeat: sql<string>`coalesce(sum(${agentTurnsTable.totalTokens}) filter (where ${agentRunTriggersTable.source} = 'heartbeat'), 0)`,
            total: sql<string>`coalesce(sum(${agentTurnsTable.totalTokens}), 0)`,
        })
        .from(agentTurnsTable)
        .leftJoin(
            agentRunTriggersTable,
            and(
                eq(agentRunTriggersTable.serverId, agentTurnsTable.serverId),
                eq(agentRunTriggersTable.agentId, agentTurnsTable.agentId),
                eq(agentRunTriggersTable.runId, agentTurnsTable.runId)
            )
        )
        .where(
            and(
                eq(agentTurnsTable.serverId, serverId),
                gte(agentTurnsTable.startedAt, since),
                eq(agentTurnsTable.computerId, pair.computerId),
                eq(agentTurnsTable.runtimeId, pair.runtimeId)
            )
        );
    return row
        ? { dream: Number(row.dream), heartbeat: Number(row.heartbeat), total: Number(row.total) }
        : emptyTokens;
}

function toShare(runtimeId: string, meter: WeeklyMeter, tokens: WeekTokens): HeartbeatPlanShare {
    const share = (part: number) =>
        tokens.total > 0 ? roundTenth((meter.usedPercent * part) / tokens.total) : 0;
    return {
        dreamPercent: share(tokens.dream),
        heartbeatPercent: share(tokens.heartbeat),
        label: meter.label,
        runtimeId,
        usedPercent: meter.usedPercent,
    };
}

/** The plan week's start: a week before the next reset, else the last seven days. */
function weekStart(meter: WeeklyMeter, now: Date): Date {
    const resetsAt = meter.resetsAt;
    if (
        resetsAt &&
        resetsAt.getTime() > now.getTime() &&
        resetsAt.getTime() - now.getTime() <= weekMs
    ) {
        return new Date(resetsAt.getTime() - weekMs);
    }
    return new Date(now.getTime() - weekMs);
}

/** The weekly meter of the plan a runtime bills against; see `weeklyUsedPercent`. */
function weeklyMeter(usage: UsageOverview | null, runtimeId: string): WeeklyMeter | null {
    if (!usage) {
        return null;
    }
    if (runtimeId === 'codex' && usage.codex.status === 'ok') {
        const window = usage.codex.snapshot.windows.find((entry) => entry.id === 'current-week');
        return window
            ? {
                  label: planLabel('ChatGPT', usage.codex.snapshot.planType),
                  resetsAt: window.resetsAt ? new Date(window.resetsAt) : null,
                  usedPercent: window.usedPercent,
              }
            : null;
    }
    if (runtimeId === 'claude-code' && usage.claude.status === 'ok') {
        const window = usage.claude.snapshot.windows.find(
            (entry) => entry.id === 'current-week-all-models'
        );
        return window
            ? {
                  label: planLabel('Claude', usage.claude.snapshot.subscriptionType),
                  resetsAt: window.resetsAt ? new Date(window.resetsAt) : null,
                  usedPercent: window.usedPercent,
              }
            : null;
    }
    return null;
}

/** `Claude Max`, `ChatGPT Pro`; just the product when the plan is unreported. */
function planLabel(product: string, plan: string | null): string {
    const name = plan?.trim();
    return name ? `${product} ${name.charAt(0).toUpperCase()}${name.slice(1)}` : product;
}

function distinctPairs(agents: readonly PlanAgent[]) {
    const pairs = new Map<string, { computerId: string; runtimeId: string }>();
    for (const agent of agents) {
        if (agent.computerId && agent.runtimeId) {
            pairs.set(`${agent.computerId}:${agent.runtimeId}`, {
                computerId: agent.computerId,
                runtimeId: agent.runtimeId,
            });
        }
    }
    return [...pairs.values()];
}

function roundTenth(value: number): number {
    return Math.round(value * 10) / 10;
}
