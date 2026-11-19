import type { PullRequestReading } from '@haus/api';
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    workerTurnsTable,
    workersTable,
    taskPullRequestsTable,
    tasksTable,
} from '../postgres/schema.ts';
import { isLiveChat } from '../workers/worker-attention.ts';
import { type PullRequestTransition, pullRequestChangeKey } from './pull-request-change.ts';
import { readUnworkedTaskWakes } from './pull-request-task-wakes.ts';

interface ReadingState {
    checks: PullRequestReading['checks'];
    state: PullRequestReading['state'];
}

export interface PullRequestWakeReading {
    headSha: string;
    number: number;
    repository: string;
    serverId: string;
    url: string;
}

interface AgentWake {
    agentId: string;
    serverId: string;
}

export function pullRequestTransitions(
    before: ReadingState,
    after: ReadingState
): PullRequestTransition[] {
    const transitions: PullRequestTransition[] = [];
    if (before.state === 'draft' && after.state === 'open') {
        transitions.push('ready_for_review');
    }
    if (before.checks === 'pending' && after.checks === 'passing') {
        transitions.push('checks_passing');
    }
    if (before.checks === 'pending' && after.checks === 'failing') {
        transitions.push('checks_failing');
    }
    return transitions;
}

export async function enqueuePullRequestWakes(
    tx: HausDatabase,
    delivery: Pick<AgentDelivery, 'enqueue'>,
    input: { reading: PullRequestWakeReading; transitions: readonly PullRequestTransition[] }
): Promise<AgentWake[]> {
    const { reading } = input;
    if (input.transitions.length === 0) {
        return [];
    }
    const wakes = new Map<string, AgentWake>();
    for (const work of await readSettledWork(tx, reading)) {
        if (!(await isLiveChat(tx, { chatId: work.chatId, serverId: reading.serverId }))) {
            continue;
        }
        for (const transition of input.transitions) {
            await delivery.enqueue(tx, {
                agentId: work.agentId,
                chatId: work.chatId,
                workerNotice: 'pull_request',
                workerTurnId: work.runId,
                content: describeTransition(reading, transition),
                dedupeKey: pullRequestChangeKey(reading, transition),
                serverId: reading.serverId,
                source: 'cloud_agent_work',
            });
        }
        wakes.set(work.agentId, { agentId: work.agentId, serverId: reading.serverId });
    }
    for (const task of await readUnworkedTaskWakes(tx, reading)) {
        if (!(await isLiveChat(tx, { chatId: task.chatId, serverId: reading.serverId }))) {
            continue;
        }
        for (const transition of input.transitions) {
            await delivery.enqueue(tx, {
                agentId: task.agentId,
                chatId: task.chatId,
                workerNotice: 'pull_request',
                content: describeTransition(reading, transition),
                dedupeKey: pullRequestChangeKey(reading, transition),
                serverId: reading.serverId,
                source: 'cloud_agent_work',
            });
        }
        wakes.set(task.agentId, { agentId: task.agentId, serverId: reading.serverId });
    }
    return [...wakes.values()];
}

async function readSettledWork(db: HausDatabase, reading: PullRequestWakeReading) {
    const workIds = await relatedWorkIds(db, reading);
    if (workIds.length === 0) {
        return [];
    }
    const works = await db
        .select({
            agentId: workersTable.agentId,
            chatId: sql<string>`coalesce(${tasksTable.chatId}, ${workersTable.chatId})`,
            id: workersTable.id,
        })
        .from(workersTable)
        .leftJoin(
            tasksTable,
            and(
                eq(tasksTable.serverId, workersTable.serverId),
                eq(tasksTable.id, workersTable.taskId)
            )
        )
        .where(and(eq(workersTable.serverId, reading.serverId), inArray(workersTable.id, workIds)));
    const settled: { agentId: string; chatId: string; runId: string }[] = [];
    for (const work of works) {
        const [newest] = await db
            .select({ id: workerTurnsTable.id, terminalAt: workerTurnsTable.terminalAt })
            .from(workerTurnsTable)
            .where(
                and(
                    eq(workerTurnsTable.serverId, reading.serverId),
                    eq(workerTurnsTable.workId, work.id)
                )
            )
            .orderBy(desc(workerTurnsTable.createdAt))
            .limit(1);
        if (newest?.terminalAt) {
            settled.push({ agentId: work.agentId, chatId: work.chatId, runId: newest.id });
        }
    }
    return settled;
}

async function relatedWorkIds(db: HausDatabase, reading: PullRequestWakeReading) {
    const reported = await db
        .selectDistinct({ workId: workerTurnsTable.workId })
        .from(workerTurnsTable)
        .where(
            and(
                eq(workerTurnsTable.serverId, reading.serverId),
                sql`exists (
                    select 1 from jsonb_array_elements(${workerTurnsTable.branches}) branch
                    where branch->>'pullRequestUrl' = ${reading.url}
                )`
            )
        );
    const onTask = await db
        .selectDistinct({ workId: workersTable.id })
        .from(taskPullRequestsTable)
        .innerJoin(
            workersTable,
            and(
                eq(workersTable.serverId, taskPullRequestsTable.serverId),
                eq(workersTable.taskId, taskPullRequestsTable.taskId)
            )
        )
        .where(
            and(
                eq(taskPullRequestsTable.serverId, reading.serverId),
                eq(taskPullRequestsTable.repository, reading.repository),
                eq(taskPullRequestsTable.number, reading.number),
                isNotNull(workersTable.taskId)
            )
        );
    return [...new Set([...reported, ...onTask].map((row) => row.workId))];
}

function describeTransition(reading: PullRequestWakeReading, transition: PullRequestTransition) {
    const pull = `${reading.repository}#${reading.number}`;
    const head = reading.headSha.slice(0, 7);
    if (transition === 'ready_for_review') {
        return `Pull request ${pull} is ready for review (head ${head}).`;
    }
    const verdict = transition === 'checks_passing' ? 'passed' : 'failed';
    return `Checks ${verdict} on pull request ${pull} (head ${head}).`;
}
