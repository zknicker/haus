import { type WorkerAutomation, workerAutomationSchema } from '@haus/api';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, workersTable, computersTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import {
    chooseWorkLocation,
    conversationChatIdOf,
    readVisibleWorkLinks,
} from './active-worker-location.ts';
import { readWorkDetails, toWorker } from './worker-shape.ts';
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
        .leftJoin(
            computersTable,
            and(
                eq(computersTable.serverId, workersTable.serverId),
                eq(computersTable.id, workersTable.computerId)
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
    const workIds = rows.map(({ work }) => work.id);
    const links = await readVisibleWorkLinks(db, {
        serverId: input.serverId,
        userId: member.id,
        workIds,
    });
    const details = await readWorkDetails(db, input.serverId, workIds);
    return rows.flatMap((row) => {
        const chosen = chooseWorkLocation(
            row.work.launchMessageId,
            links.filter((link) => link.workId === row.work.id)
        );
        return chosen
            ? [
                  workerAutomationSchema.parse({
                      conversationChatId: conversationChatIdOf(chosen.link),
                      computerHealth: row.computerHealth,
                      location: chosen.location,
                      notification: row.notification,
                      work: toWorker(row.work, details.get(row.work.id)),
                  }),
              ]
            : [];
    });
}

function notificationSql() {
    // Notices are per Run, including older Runs behind a queued follow-up.
    return sql<string>`case
        when exists (
            select 1 from agent_inbox i
            join cloud_agent_runs r on r.server_id = i.server_id and r.id = i.cloud_agent_run_id
            where r.server_id = ${workersTable.serverId}
                and r.work_id = ${workersTable.id}
                and i.agent_id = ${workersTable.agentId}
                and i.source = 'cloud_agent_work' and i.state <> 'seen'
        ) then case when ${agentsTable.retiredAt} is not null
            then 'agent-retired' else 'pending' end
        when ${workersTable.status} not in ('queued', 'running') and exists (
            select 1 from agent_inbox i
            join cloud_agent_runs r on r.server_id = i.server_id and r.id = i.cloud_agent_run_id
            where r.server_id = ${workersTable.serverId}
                and r.work_id = ${workersTable.id}
                and i.agent_id = ${workersTable.agentId}
                and i.cloud_agent_notice = 'settled' and i.state = 'seen'
                and r.id = (select latest.id from cloud_agent_runs latest
                    where latest.server_id = r.server_id and latest.work_id = r.work_id
                    order by latest.created_at desc limit 1)
        ) then 'delivered'
        when ${agentsTable.retiredAt} is not null then 'agent-retired'
        when ${computersTable.id} is null and ${workersTable.status} in ('queued', 'running')
            then 'computer-removed'
        when not exists (
            select 1 from chats c left join chats p
                on p.server_id = c.server_id and p.id = c.parent_chat_id
            where c.server_id = ${workersTable.serverId}
                and c.id = ${workersTable.chatId} and c.deleted_at is null
                and (c.parent_chat_id is null or (p.id is not null and p.deleted_at is null))
        ) then 'chat-removed'
        when ${workersTable.status} not in ('queued', 'running') then 'unavailable'
        else 'waiting' end`;
}
