import { type WorkerAutomation, workerAutomationSchema } from '@haus/api';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, computersTable, tasksTable, workersTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { readWorkerDetails, toWorker } from './worker-shape.ts';
import { workerVisibleSql } from './worker-visibility.ts';

/** A read-only projection: no Trigger record or cleanup job is created. */
export async function listWorkerAutomations(
    db: HausDatabase,
    member: HausUser | null,
    input: { agentId: string; history: boolean; serverId: string }
): Promise<WorkerAutomation[]> {
    await requireServerMembership(db, member, input.serverId);
    if (!member) {
        return [];
    }
    const notification = notificationSql();
    const current = sql`${notification} in ('waiting', 'pending')`;
    const selection = db
        .select({
            computerHealth: computersTable.health,
            notification,
            parentChatId: sql<
                string | null
            >`(select parent_chat_id from chats where server_id = ${tasksTable.serverId} and id = ${tasksTable.chatId})`,
            taskChatId: tasksTable.chatId,
            work: workersTable,
        })
        .from(workersTable)
        .innerJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, workersTable.serverId),
                eq(agentsTable.id, workersTable.agentId)
            )
        )
        .innerJoin(
            tasksTable,
            and(
                eq(tasksTable.serverId, workersTable.serverId),
                eq(tasksTable.id, workersTable.taskId)
            )
        )
        .leftJoin(
            computersTable,
            and(
                eq(computersTable.serverId, workersTable.serverId),
                eq(computersTable.id, workersTable.carrierComputerId)
            )
        )
        .where(
            and(
                eq(workersTable.serverId, input.serverId),
                eq(workersTable.agentId, input.agentId),
                workerVisibleSql(db, input.serverId, { kind: 'user', userId: member.id }),
                input.history ? sql`not (${current})` : current
            )
        )
        .orderBy(
            input.history ? desc(workersTable.updatedAt) : asc(workersTable.createdAt),
            asc(workersTable.id)
        );
    // History is bounded independently, so old pending notifications are never crowded out.
    const rows = await (input.history ? selection.limit(100) : selection);
    const details = await readWorkerDetails(
        db,
        input.serverId,
        rows.map(({ work }) => work.id)
    );
    return rows.flatMap((row) =>
        row.taskChatId && row.parentChatId && row.work.taskId
            ? [
                  workerAutomationSchema.parse({
                      conversationChatId: row.parentChatId,
                      computerHealth: row.computerHealth,
                      location: { chatId: row.taskChatId, kind: 'task', taskId: row.work.taskId },
                      notification: row.notification,
                      worker: toWorker(row.work, details.get(row.work.id)),
                  }),
              ]
            : []
    );
}

function notificationSql() {
    // Notices are per Run, including older Runs behind a queued follow-up.
    return sql<string>`case
        when exists (
            select 1 from agent_inbox i
            join worker_turns r on r.server_id = i.server_id and r.id = i.worker_turn_id
            where r.server_id = ${workersTable.serverId}
                and r.worker_id = ${workersTable.id}
                and i.agent_id = ${workersTable.agentId}
                and i.source in ('worker_report', 'worker_stall', 'pull_request') and i.state <> 'seen'
        ) then case when ${agentsTable.retiredAt} is not null
            then 'agent-retired' else 'pending' end
        when ${workersTable.status} not in ('queued', 'running') and exists (
            select 1 from agent_inbox i
            join worker_turns r on r.server_id = i.server_id and r.id = i.worker_turn_id
            where r.server_id = ${workersTable.serverId}
                and r.worker_id = ${workersTable.id}
                and i.agent_id = ${workersTable.agentId}
                and i.source = 'worker_report' and i.state = 'seen'
                and r.id = (select latest.id from worker_turns latest
                    where latest.server_id = r.server_id and latest.worker_id = r.worker_id
                    order by latest.created_at desc limit 1)
        ) then 'delivered'
        when ${agentsTable.retiredAt} is not null then 'agent-retired'
        when ${computersTable.id} is null and ${workersTable.status} in ('queued', 'running')
            then 'computer-removed'
        when not exists (
            select 1 from chats c left join chats p
                on p.server_id = c.server_id and p.id = c.parent_chat_id
            where c.server_id = ${workersTable.serverId}
                and c.id = ${tasksTable.chatId} and c.deleted_at is null
                and (c.parent_chat_id is null or (p.id is not null and p.deleted_at is null))
        ) then 'chat-removed'
        when ${workersTable.status} not in ('queued', 'running') then 'unavailable'
        else 'waiting' end`;
}
