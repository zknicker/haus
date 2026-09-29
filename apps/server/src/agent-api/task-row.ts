import { and, eq, inArray } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, type messageTasksTable } from '../postgres/schema.ts';
import { type MessageRow, targetForChat, toAgentMessages } from './message-view.ts';
import { AgentTargetError } from './resolve-target.ts';

type TaskRecord = typeof messageTasksTable.$inferSelect;

export type AgentTaskRow = Awaited<ReturnType<typeof taskRows>>[number];

export async function taskRow(
    db: HausDatabase,
    runner: ResolvedRunner,
    messageRow: MessageRow,
    task: TaskRecord
) {
    const [row] = await taskRows(db, runner, [{ message: messageRow, task }]);
    if (!row) {
        throw new Error('Task projection lost its row.');
    }
    return row;
}

/** Projects many tasks with a fixed number of reads, whatever the row count. */
export async function taskRows(
    db: HausDatabase,
    runner: ResolvedRunner,
    rows: Array<{ message: MessageRow; task: TaskRecord }>
) {
    if (rows.length === 0) {
        return [];
    }
    const messages = await toAgentMessages(
        db,
        runner.serverId,
        rows.map((row) => row.message)
    );
    const agentHandles = await agentHandlesById(
        db,
        runner.serverId,
        rows.flatMap((row) => row.task.assigneeAgentId ?? [])
    );
    // Sequential: `db` is often the caller's transaction connection.
    const targets = new Map<string, string>();
    for (const chatId of new Set(rows.map((row) => row.task.chatId))) {
        targets.set(chatId, await targetForChat(db, runner.serverId, chatId));
    }
    return rows.map(({ task }, index) => ({
        assignee: taskAssignee(task, agentHandles),
        message: messages[index] as (typeof messages)[number],
        number: task.number,
        status: task.status,
        target: targets.get(task.chatId) ?? '#unknown',
        version: task.version,
    }));
}

function taskAssignee(task: TaskRecord, agentHandles: Map<string, string>) {
    if (task.assigneeAgentId) {
        const handle = agentHandles.get(task.assigneeAgentId);
        if (!handle) {
            throw new AgentTargetError('This Agent no longer exists.');
        }
        return { handle, id: task.assigneeAgentId };
    }
    return null;
}

async function agentHandlesById(db: HausDatabase, serverId: string, ids: string[]) {
    if (ids.length === 0) {
        return new Map<string, string>();
    }
    const agents = await db
        .select({ handle: agentsTable.handle, id: agentsTable.id })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, serverId), inArray(agentsTable.id, [...new Set(ids)])));
    return new Map(agents.map((agent) => [agent.id, agent.handle]));
}

export async function agentHandle(
    db: HausDatabase,
    runner: Pick<ResolvedRunner, 'agentId' | 'serverId'>
) {
    const [agent] = await db
        .select({ handle: agentsTable.handle })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, runner.serverId), eq(agentsTable.id, runner.agentId)));
    if (!agent) {
        throw new AgentTargetError('This Agent no longer exists.');
    }
    return agent.handle;
}

export function stripAt(value: string) {
    return value.startsWith('@') ? value.slice(1) : value;
}
