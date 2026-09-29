import type { NeedsYouRow } from '@haus/api';
import { readStoredAuthorProfile } from '../chats/message-shape.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { needsYouPreview } from './needs-you-preview.ts';
import { type NeedsYouChatRow, readNeedsYouChats } from './needs-you-query.ts';

/**
 * The viewer's Needs you rows (ADR 0037): one per Chat holding DM, mention, or
 * inline-reply addressing the viewer has not answered or marked Done, newest first. Only a
 * Server member (a human) has a Needs you; Agents are addressed through their
 * Agent inbox instead.
 */
export async function listNeedsYou(
    db: HausDatabase,
    member: HausUser | null,
    input: { serverId: string }
): Promise<NeedsYouRow[]> {
    await requireServerMembership(db, member, input.serverId);
    if (!member) {
        return [];
    }
    const rows = await readNeedsYouChats(db, {
        serverId: input.serverId,
        viewerUserId: member.id,
    });
    return rows.map(toNeedsYouRow);
}

function toNeedsYouRow(row: NeedsYouChatRow): NeedsYouRow {
    const anchoring = {
        addressedCount: row.addressedCount,
        chatId: row.chatId,
        conversationChatId: row.conversationChatId,
        latest: {
            author: readAuthor(row),
            createdAt: new Date(row.createdAt).toISOString(),
            messageId: row.messageId,
            preview: needsYouPreview(row.content),
            sequence: row.sequence,
        },
        threadAnchorMessageId: row.chatId === row.conversationChatId ? null : row.anchorMessageId,
    };
    if (row.conversationKind === 'dm') {
        if (!(row.peerUserId || row.dmAgentId)) {
            throw new Error(`Needs you DM ${row.chatId} has no peer.`);
        }
        return {
            ...anchoring,
            chatKind: 'dm',
            chatPeerAgentId: row.dmAgentId,
            chatPeerUserId: row.peerUserId,
            reason: 'dm',
        };
    }
    if (!row.conversationName) {
        throw new Error(`Needs you Channel ${row.conversationChatId} has no name.`);
    }
    if (row.reason === 'dm') {
        throw new Error(`Needs you Channel row ${row.chatId} has a DM reason.`);
    }
    return {
        ...anchoring,
        chatKind: 'channel',
        chatName: row.conversationName,
        reason: row.reason,
    };
}

function readAuthor(row: NeedsYouChatRow): NeedsYouRow['latest']['author'] {
    const profile = readStoredAuthorProfile(row);
    if (row.authorAgentId) {
        return { agentId: row.authorAgentId, kind: 'agent', ...(profile ? { profile } : {}) };
    }
    if (!row.authorUserId) {
        throw new Error(`Needs you Message ${row.messageId} has no author.`);
    }
    return { kind: 'human', ...(profile ? { profile } : {}), userId: row.authorUserId };
}
