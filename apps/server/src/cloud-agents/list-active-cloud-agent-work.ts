import type { ActiveCloudAgentWork, ChatMessage } from '@haus/api';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { readMessagesById } from '../chats/read-messages-by-id.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { cloudAgentWorkTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import {
    type ChosenWorkLocation,
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
 * `location` says where the row opens. The legacy `message`,
 * `threadAnchorMessage`, and `threadChatId` describe that same place for
 * released Apps: on a `message` row without a Thread, `threadChatId` names
 * the Chat holding the linking Message.
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
    const works = await db
        .select()
        .from(cloudAgentWorkTable)
        .where(
            and(
                eq(cloudAgentWorkTable.serverId, input.serverId),
                inArray(cloudAgentWorkTable.status, ['queued', 'running']),
                cloudAgentWorkVisibleSql(db, input.serverId, { kind: 'user', userId: member.id })
            )
        )
        .orderBy(asc(cloudAgentWorkTable.createdAt), asc(cloudAgentWorkTable.id));
    const workIds = works.map((work) => work.id);
    const links = await readVisibleWorkLinks(db, {
        serverId: input.serverId,
        userId: member.id,
        workIds,
    });
    const childThreads = await readChildThreads(db, {
        messageIds: [...new Set(links.map((link) => link.messageId))],
        serverId: input.serverId,
    });
    const chosen = works.flatMap((work) => {
        const location = chooseWorkLocation(
            work.launchMessageId,
            links.filter((link) => link.workId === work.id),
            childThreads
        );
        return location ? [{ chosen: location, work }] : [];
    });
    const [runs, messages] = await Promise.all([
        readRuns(db, input.serverId, workIds),
        readMessagesById(
            db,
            input.serverId,
            chosen.flatMap(({ chosen: { link } }) =>
                link.chatKind === 'thread' && link.chatAnchorMessageId
                    ? [link.messageId, link.chatAnchorMessageId]
                    : [link.messageId]
            )
        ),
    ]);
    return chosen.map(({ chosen: { link, location }, work: row }) => {
        const work = toCloudAgentWork(row, runs.get(row.id) ?? []);
        const message = messages.get(link.messageId);
        if (!message) {
            throw new Error(`Cloud Agent work ${work.id} has no readable linking Message.`);
        }
        return {
            ...conversationFacts(link, member.id),
            location,
            message,
            threadAnchorMessage: readThreadAnchor(link, messages),
            threadChatId: legacyThreadChatId(location),
            work,
        };
    });
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

function readThreadAnchor(
    link: VisibleWorkLink,
    messages: ReadonlyMap<string, ChatMessage>
): ChatMessage | null {
    if (link.chatKind !== 'thread' || !link.chatAnchorMessageId) {
        return null;
    }
    const anchor = messages.get(link.chatAnchorMessageId);
    if (!anchor) {
        throw new Error(`Cloud Agent work link ${link.messageId} has no readable Thread anchor.`);
    }
    return anchor;
}

function legacyThreadChatId(location: ChosenWorkLocation['location']): string {
    return location.kind === 'work-thread'
        ? location.threadChatId
        : (location.threadChatId ?? location.chatId);
}
