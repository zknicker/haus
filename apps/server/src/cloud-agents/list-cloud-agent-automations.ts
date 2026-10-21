import { type CloudAgentAutomation, cloudAgentAutomationSchema } from '@haus/api';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, cloudAgentWorkTable, computersTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import {
    chooseWorkLocation,
    conversationChatIdOf,
    readChildThreads,
    readVisibleWorkLinks,
} from './active-cloud-agent-work-location.ts';
import { readRuns, toCloudAgentWork } from './cloud-agent-shape.ts';
import { cloudAgentWorkVisibleSql } from './cloud-agent-work-visibility.ts';

/** A read-only projection: no Trigger record or cleanup job is created. */
export async function listCloudAgentAutomations(
    db: HausDatabase,
    member: HausUser | null,
    input: { agentId: string; history: boolean; serverId: string }
): Promise<CloudAgentAutomation[]> {
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
            work: cloudAgentWorkTable,
        })
        .from(cloudAgentWorkTable)
        .innerJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, cloudAgentWorkTable.serverId),
                eq(agentsTable.id, cloudAgentWorkTable.agentId)
            )
        )
        .leftJoin(
            computersTable,
            and(
                eq(computersTable.serverId, cloudAgentWorkTable.serverId),
                eq(computersTable.id, cloudAgentWorkTable.computerId)
            )
        )
        .where(
            and(
                eq(cloudAgentWorkTable.serverId, input.serverId),
                eq(cloudAgentWorkTable.agentId, input.agentId),
                cloudAgentWorkVisibleSql(db, input.serverId, { kind: 'user', userId: member.id }),
                input.history ? sql`not (${current})` : current
            )
        )
        .orderBy(
            input.history
                ? desc(cloudAgentWorkTable.updatedAt)
                : asc(cloudAgentWorkTable.createdAt),
            asc(cloudAgentWorkTable.id)
        );
    // History is bounded independently, so old pending notifications are never crowded out.
    const rows = await (input.history ? selection.limit(100) : selection);
    const workIds = rows.map(({ work }) => work.id);
    const links = await readVisibleWorkLinks(db, {
        serverId: input.serverId,
        userId: member.id,
        workIds,
    });
    const threads = await readChildThreads(db, {
        messageIds: links.map((link) => link.messageId),
        serverId: input.serverId,
    });
    const runs = await readRuns(db, input.serverId, workIds);
    return rows.flatMap((row) => {
        const chosen = chooseWorkLocation(
            row.work.launchMessageId,
            links.filter((link) => link.workId === row.work.id),
            threads
        );
        return chosen
            ? [
                  cloudAgentAutomationSchema.parse({
                      conversationChatId: conversationChatIdOf(chosen.link),
                      computerHealth: row.computerHealth,
                      location: chosen.location,
                      notification: row.notification,
                      work: toCloudAgentWork(row.work, runs.get(row.work.id) ?? []),
                  }),
              ]
            : [];
    });
}

function notificationSql() {
    // Inbox identities are per Run, including older Runs behind a queued follow-up.
    return sql<string>`case
        when exists (
            select 1 from agent_inbox i
            join cloud_agent_runs r on r.server_id = i.server_id and r.id = i.dedupe_key
            where r.server_id = ${cloudAgentWorkTable.serverId}
                and r.work_id = ${cloudAgentWorkTable.id}
                and i.agent_id = ${cloudAgentWorkTable.agentId}
                and i.source = 'cloud_agent_work' and i.state <> 'seen'
        ) then case when ${agentsTable.retiredAt} is not null
            then 'agent-retired' else 'pending' end
        when ${cloudAgentWorkTable.status} not in ('queued', 'running') and exists (
            select 1 from agent_inbox i
            join cloud_agent_runs r on r.server_id = i.server_id and r.id = i.dedupe_key
            where r.server_id = ${cloudAgentWorkTable.serverId}
                and r.work_id = ${cloudAgentWorkTable.id}
                and i.agent_id = ${cloudAgentWorkTable.agentId}
                and i.source = 'cloud_agent_work' and i.state = 'seen'
                and r.id = (select latest.id from cloud_agent_runs latest
                    where latest.server_id = r.server_id and latest.work_id = r.work_id
                    order by latest.created_at desc limit 1)
        ) then 'delivered'
        when ${agentsTable.retiredAt} is not null then 'agent-retired'
        when ${computersTable.id} is null and ${cloudAgentWorkTable.status} in ('queued', 'running')
            then 'computer-removed'
        when not exists (
            select 1 from chats c left join chats p
                on p.server_id = c.server_id and p.id = c.parent_chat_id
            where c.server_id = ${cloudAgentWorkTable.serverId}
                and c.id = ${cloudAgentWorkTable.chatId} and c.deleted_at is null
                and (c.parent_chat_id is null or (p.id is not null and p.deleted_at is null))
        ) then 'chat-removed'
        when ${cloudAgentWorkTable.status} not in ('queued', 'running') then 'unavailable'
        else 'waiting' end`;
}
