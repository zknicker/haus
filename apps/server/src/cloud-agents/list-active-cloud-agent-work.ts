import type { ActiveCloudAgentWork } from '@haus/api';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, cloudAgentWorkTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import {
    chooseWorkLocation,
    conversationChatIdOf,
    readChildThreads,
    readVisibleWorkLinks,
    type VisibleWorkLink,
} from './active-cloud-agent-work-location.ts';
import { readRuns, toCloudAgentWork } from './cloud-agent-shape.ts';
import { cloudAgentWorkVisibleSql } from './cloud-agent-work-visibility.ts';

/**
 * Every queued or running Cloud Agent work the viewer can see, oldest first
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
    const childThreads = await readChildThreads(db, {
        messageIds: [...new Set(links.map((link) => link.messageId))],
        serverId: input.serverId,
    });
    const chosen = rows.flatMap(({ agentName, work }) => {
        const location = chooseWorkLocation(
            work.launchMessageId,
            links.filter((link) => link.workId === work.id),
            childThreads
        );
        return location ? [{ agentName, chosen: location, work }] : [];
    });
    const runs = await readRuns(db, input.serverId, workIds);
    return chosen.map(({ agentName, chosen: { link, location }, work: row }) => ({
        ...conversationFacts(link, member.id),
        agentName,
        location,
        work: toCloudAgentWork(row, runs.get(row.id) ?? []),
    }));
}

function conversationFacts(link: VisibleWorkLink, viewerUserId: string) {
    const inThread = link.chatKind === 'thread';
    const kind = inThread ? link.parentKind : link.chatKind;
    if (kind !== 'channel' && kind !== 'dm') {
        throw new Error(`Cloud Agent work link ${link.messageId} is not in a Channel or DM.`);
    }
    const one = inThread ? link.parentDmMemberOneUserId : link.chatDmMemberOneUserId;
    const two = inThread ? link.parentDmMemberTwoUserId : link.chatDmMemberTwoUserId;
    return {
        chatKind: kind,
        chatName: inThread ? link.parentName : link.chatName,
        chatPeerUserId: kind === 'dm' ? (one === viewerUserId ? two : one) : null,
        conversationChatId: conversationChatIdOf(link),
    };
}
