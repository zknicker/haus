import type { ActiveWorker } from '@haus/api';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, workersTable, tasksTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { readTasks } from '../tasks/task-read.ts';
import type { HausUser } from '../users/haus-user.ts';
import {
    chooseWorkLocation,
    conversationChatIdOf,
    readVisibleWorkLinks,
    type VisibleWorkLink,
} from './active-worker-location.ts';
import { readWorkDetails, toWorker } from './worker-shape.ts';
import { workerVisibleSql } from './worker-visibility.ts';

/**
 * Every queued, running, or pending-input Worker the viewer can see, oldest first
 * (ADR 0044): visible when any link lives in a Chat the viewer can read.
 * `location` says where the row opens.
 */
export async function listActiveWorker(
    db: HausDatabase,
    member: HausUser | null,
    input: { serverId: string }
): Promise<ActiveWorker[]> {
    await requireServerMembership(db, member, input.serverId);
    if (!member) {
        return [];
    }
    // A retired Agent keeps its row, so its stored name still names its work.
    const rows = await db
        .select({ agentName: agentsTable.displayName, work: workersTable })
        .from(workersTable)
        .innerJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, workersTable.serverId),
                eq(agentsTable.id, workersTable.agentId)
            )
        )
        .where(
            and(
                eq(workersTable.serverId, input.serverId),
                inArray(workersTable.status, ['queued', 'running', 'pending_input']),
                workerVisibleSql(db, input.serverId, { kind: 'user', userId: member.id })
            )
        )
        .orderBy(asc(workersTable.createdAt), asc(workersTable.id));
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
            work: toWorker(row, details.get(row.id)),
        };
    });
}

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

function conversationFacts(link: VisibleWorkLink, viewerUserId: string) {
    const inTask = link.chatKind === 'task';
    const kind = inTask ? link.parentKind : link.chatKind;
    if (kind !== 'channel' && kind !== 'dm') {
        throw new Error(`Worker link ${link.messageId} is not in a Channel or DM.`);
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
