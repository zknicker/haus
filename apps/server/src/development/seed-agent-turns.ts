import type { AgentTurnActivitySummary } from '@haus/api';
import { and, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { agentsTable, agentTurnsTable } from '../postgres/schema.ts';
import type { InboxSeedContext } from './seed-inbox-context.ts';

interface TurnPlan {
    agentId: string;
    /** Turns per day, oldest day first, ending with today. */
    countsByDay: number[];
    /** How many days ago the one failed turn ran, or null for none. */
    failedDaysAgo: number | null;
    summaries: string[];
}

interface AgentExecution {
    modelId: string | null;
    runtimeId: string | null;
}

const turnSpacingMs = 95 * 60_000;
const turnDurationsMs = [3, 6, 11, 4].map((minutes) => minutes * 60_000);

const activityShapes: AgentTurnActivitySummary[] = [
    { operations: [{ category: 'reading_files', completed: 6, failed: 0, interrupted: 0 }] },
    {
        operations: [
            { category: 'reading_files', completed: 4, failed: 0, interrupted: 0 },
            { category: 'editing_files', completed: 3, failed: 0, interrupted: 0 },
        ],
    },
    {
        operations: [
            { category: 'editing_files', completed: 2, failed: 0, interrupted: 0 },
            { category: 'running_command', completed: 3, failed: 1, interrupted: 0 },
        ],
    },
];

/**
 * Seven days of settled turns for the demo Agents, so the roster reads a real
 * cadence: varied per-day counts, one failure, and a summary a person can
 * recognize. Turn rows are the Computer's compact report of work that already
 * happened, so seeding them claims nothing about a running Computer.
 */
export async function seedAgentTurns(
    tx: HausDatabase,
    context: InboxSeedContext,
    now: Date
): Promise<void> {
    const plans: TurnPlan[] = [
        {
            agentId: context.blippyId,
            countsByDay: [2, 0, 3, 1, 4, 2, 1],
            failedDaysAgo: 2,
            summaries: [
                'Traced the sidebar badge count to the cached chat row.',
                'Split the unread rollup out of the chat list query.',
                'Answered the weekly digest question in #all.',
                'Handed the last-message preview to a cloud agent.',
            ],
        },
        {
            agentId: context.tinyId,
            countsByDay: [1, 1, 0, 2, 0, 3, 2],
            failedDaysAgo: null,
            summaries: [
                'Audited the member directory for stale copy.',
                'Pressure-tested the rename proposal for #product.',
                'Checked the build questions piling up in #product.',
            ],
        },
        {
            agentId: context.coveId,
            countsByDay: [0, 0, 1, 0, 0, 0, 1],
            failedDaysAgo: null,
            summaries: [
                'Walked the owner through connecting a Computer.',
                'Asked the owner about the channel rename.',
            ],
        },
    ];
    const execution = await readAgentExecution(
        tx,
        context.serverId,
        plans.map((plan) => plan.agentId)
    );

    const rows = plans.flatMap((plan) =>
        planTurnRows(plan, requireExecution(execution, plan.agentId), context, now)
    );
    await tx.insert(agentTurnsTable).values(rows);
}

function planTurnRows(
    plan: TurnPlan,
    execution: AgentExecution,
    context: InboxSeedContext,
    now: Date
) {
    return plan.countsByDay.flatMap((count, dayIndex) => {
        const daysAgo = plan.countsByDay.length - 1 - dayIndex;
        const dayEnd = seededDayEnd(now, daysAgo);
        return Array.from({ length: count }, (_unused, index) =>
            turnRow({
                context,
                daysAgo,
                execution,
                plan,
                shapeIndex: dayIndex + index,
                startedAt: new Date(dayEnd.getTime() - (count - index) * turnSpacingMs),
                turnIndex: index,
            })
        );
    });
}

function turnRow(input: {
    context: InboxSeedContext;
    daysAgo: number;
    execution: AgentExecution;
    plan: TurnPlan;
    shapeIndex: number;
    startedAt: Date;
    turnIndex: number;
}) {
    const failed = input.plan.failedDaysAgo === input.daysAgo && input.turnIndex === 0;
    return {
        activity: activityShapes[input.shapeIndex % activityShapes.length],
        agentId: input.plan.agentId,
        cacheReadTokens: 12_400,
        computerId: input.context.computerId,
        endedAt: new Date(
            input.startedAt.getTime() + turnDurationsMs[input.turnIndex % turnDurationsMs.length]
        ),
        failureKind: failed ? 'runtime-error' : null,
        id: createOpaqueId('atn'),
        inputTokens: 18_200,
        messageCount: failed ? 0 : 1,
        modelId: input.execution.modelId,
        outputProduced: !failed,
        outputTokens: failed ? 180 : 1450,
        reportedAt: new Date(input.startedAt.getTime() + turnSpacingMs / 2),
        runId: `run_dev_turn_${input.daysAgo}_${input.turnIndex}`,
        runtimeId: input.execution.runtimeId,
        serverId: input.context.serverId,
        startedAt: input.startedAt,
        status: failed ? ('failed' as const) : ('completed' as const),
        summary: failed
            ? 'Stopped partway through the digest reminder trace.'
            : input.plan.summaries[input.shapeIndex % input.plan.summaries.length],
        tokenUsageReported: true,
        totalTokens: failed ? 30_780 : 32_050,
    };
}

/** Today's turns end just before the seed; every earlier day ends at 18:00. */
function seededDayEnd(now: Date, daysAgo: number): Date {
    if (daysAgo === 0) {
        return new Date(now.getTime() - 4 * 60_000);
    }
    const day = new Date(now);
    day.setDate(day.getDate() - daysAgo);
    day.setHours(18, 0, 0, 0);
    return day;
}

async function readAgentExecution(
    tx: HausDatabase,
    serverId: string,
    agentIds: string[]
): Promise<Map<string, AgentExecution>> {
    const rows = await tx
        .select({
            id: agentsTable.id,
            modelId: agentsTable.desiredModelId,
            runtimeId: agentsTable.desiredRuntimeId,
        })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, serverId), inArray(agentsTable.id, agentIds)));
    return new Map(rows.map((row) => [row.id, { modelId: row.modelId, runtimeId: row.runtimeId }]));
}

function requireExecution(execution: Map<string, AgentExecution>, agentId: string): AgentExecution {
    const found = execution.get(agentId);
    if (!found) {
        throw new Error(`The development Inbox seed found no execution for Agent ${agentId}.`);
    }
    return found;
}
