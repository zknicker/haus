import type { ActiveCloudAgentWork } from '@haus/api';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, cloudAgentWorkTable, tasksTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { readTasks } from '../tasks/task-read.ts';
import type { HausUser } from '../users/haus-user.ts';
import {
    chooseWorkLocation,
    conversationChatIdOf,
    readVisibleWorkLinks,
    type VisibleWorkLink,
} from './active-cloud-agent-work-location.ts';
import { readWorkDetails, toCloudAgentWork } from './cloud-agent-shape.ts';
import { cloudAgentWorkVisibleSql } from './cloud-agent-work-visibility.ts';

/**
 * Every queued, running, or pending-input Cloud Agent work the viewer can see, oldest first
 * (ADR 0044): visible when any link lives in a Chat the viewer can read.
 * `location` says where the row opens.
 */
export async function listActiveCloudAgentWork(
    db: HausDatabase,
    member: HausUser | null,
    input: { serverId: string }
): Promise<ActiveCloudAgentWork[]> {
    await requireServerMembership(db, member, input.serverId);
    if (!member) {
        return [];
    }
    // A retired Agent keeps its row, so its stored name still names its work.
    const rows = await db
        .select({ agentName: agentsTable.displayName, work: cloudAgentWorkTable })
        .from(cloudAgentWorkTable)
        .innerJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, cloudAgentWorkTable.serverId),
                eq(agentsTable.id, cloudAgentWorkTable.agentId)
            )
        )
        .where(
            and(
                eq(cloudAgentWorkTable.serverId, input.serverId),
                inArray(cloudAgentWorkTable.status, ['queued', 'running', 'pending_input']),
                cloudAgentWorkVisibleSql(db, input.serverId, { kind: 'user', userId: member.id })
            )
        )
        .orderBy(asc(cloudAgentWorkTable.createdAt), asc(cloudAgentWorkTable.id));
    const workIds = rows.map((row) => row.work.id);
    const links = await readVisibleWorkLinks(db, {
        serverId: input.serverId,
        userId: member.id,
        workIds,
    });
    const chosen = rows.flatMap(({ agentName, work }) => {
        const location = chooseWorkLocation(
            work.launchMessageId,
            links.filter((link) => link.workId === work.id)
        );
        return location ? [{ agentName, chosen: location, work }] : [];
    });
    const details = await readWorkDetails(db, input.serverId, workIds);
    const taskKeys = await readTaskKeys(db, {
        serverId: input.serverId,
        taskIds: chosen.flatMap(({ work }) => (work.taskId ? [work.taskId] : [])),
    });
    return chosen.map(({ agentName, chosen: { link, location }, work: row }) => {
        const taskKey = row.taskId ? (taskKeys.get(row.taskId) ?? null) : null;
        return {
            ...conversationFacts(link, member.id),
            agentName,
            location,
            taskId: taskKey ? row.taskId : null,
            taskKey,
            work: toCloudAgentWork(row, details.get(row.id)),
        };
    });
}

/** Each Task's key (`SEC-12`), by id: the Task a row of attached work names. */
async function readTaskKeys(
    db: HausDatabase,
    input: { serverId: string; taskIds: string[] }
): Promise<Map<string, string>> {
    if (input.taskIds.length === 0) {
        return new Map();
    }
    const tasks = await readTasks(db, {
        serverId: input.serverId,
        where: inArray(tasksTable.id, [...new Set(input.taskIds)]),
    });
    return new Map(tasks.map((task) => [task.id, task.key]));
}

/**
 * The Channel or DM a link's row names. A Task's Chat (ADR 0052) takes its
 * Channel's kind and name; a Task stays its own conversation.
 */
function conversationFacts(link: VisibleWorkLink, viewerUserId: string) {
    const inTask = link.chatKind === 'task';
    const kind = inTask ? link.parentKind : link.chatKind;
    if (kind !== 'channel' && kind !== 'dm') {
        throw new Error(`Cloud Agent work link ${link.messageId} is not in a Channel or DM.`);
    }
    const one = inTask ? link.parentDmMemberOneUserId : link.chatDmMemberOneUserId;
    const two = inTask ? link.parentDmMemberTwoUserId : link.chatDmMemberTwoUserId;
    return {
        chatKind: kind,
        chatName: inTask ? link.parentName : link.chatName,
        chatPeerUserId: kind === 'dm' ? (one === viewerUserId ? two : one) : null,
        conversationChatId: conversationChatIdOf(link),
    };
}
