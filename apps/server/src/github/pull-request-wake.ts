import type { CloudAgentPullRequestReading } from '@haus/api';
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { isLiveChat } from '../cloud-agents/cloud-agent-attention.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    cloudAgentRunsTable,
    cloudAgentWorkTable,
    taskPullRequestsTable,
    tasksTable,
} from '../postgres/schema.ts';
import { type PullRequestTransition, pullRequestChangeKey } from './pull-request-change.ts';
import { readUnworkedTaskWakes } from './pull-request-task-wakes.ts';

interface ReadingState {
    checks: CloudAgentPullRequestReading['checks'];
    state: CloudAgentPullRequestReading['state'];
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
                cloudAgentNotice: 'pull_request',
                cloudAgentRunId: work.runId,
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
                cloudAgentNotice: 'pull_request',
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
            agentId: cloudAgentWorkTable.agentId,
            chatId: sql<string>`coalesce(${tasksTable.chatId}, ${cloudAgentWorkTable.chatId})`,
            id: cloudAgentWorkTable.id,
        })
        .from(cloudAgentWorkTable)
        .leftJoin(
            tasksTable,
            and(
                eq(tasksTable.serverId, cloudAgentWorkTable.serverId),
                eq(tasksTable.id, cloudAgentWorkTable.taskId)
            )
        )
        .where(
            and(
                eq(cloudAgentWorkTable.serverId, reading.serverId),
                inArray(cloudAgentWorkTable.id, workIds)
            )
        );
    const settled: { agentId: string; chatId: string; runId: string }[] = [];
    for (const work of works) {
        const [newest] = await db
            .select({ id: cloudAgentRunsTable.id, terminalAt: cloudAgentRunsTable.terminalAt })
            .from(cloudAgentRunsTable)
            .where(
                and(
                    eq(cloudAgentRunsTable.serverId, reading.serverId),
                    eq(cloudAgentRunsTable.workId, work.id)
                )
            )
            .orderBy(desc(cloudAgentRunsTable.createdAt))
            .limit(1);
        if (newest?.terminalAt) {
            settled.push({ agentId: work.agentId, chatId: work.chatId, runId: newest.id });
        }
    }
    return settled;
}

async function relatedWorkIds(db: HausDatabase, reading: PullRequestWakeReading) {
    const reported = await db
        .selectDistinct({ workId: cloudAgentRunsTable.workId })
        .from(cloudAgentRunsTable)
        .where(
            and(
                eq(cloudAgentRunsTable.serverId, reading.serverId),
                sql`exists (
                    select 1 from jsonb_array_elements(${cloudAgentRunsTable.branches}) branch
                    where branch->>'pullRequestUrl' = ${reading.url}
                )`
            )
        );
    const onTask = await db
        .selectDistinct({ workId: cloudAgentWorkTable.id })
        .from(taskPullRequestsTable)
        .innerJoin(
            cloudAgentWorkTable,
            and(
                eq(cloudAgentWorkTable.serverId, taskPullRequestsTable.serverId),
                eq(cloudAgentWorkTable.taskId, taskPullRequestsTable.taskId)
            )
        )
        .where(
            and(
                eq(taskPullRequestsTable.serverId, reading.serverId),
                eq(taskPullRequestsTable.repository, reading.repository),
                eq(taskPullRequestsTable.number, reading.number),
                isNotNull(cloudAgentWorkTable.taskId)
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
