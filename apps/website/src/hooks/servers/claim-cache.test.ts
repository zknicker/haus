import { expect, test } from 'bun:test';
import type { ClaimListItem, MessageClaim } from '@haus/api';
import { replaceClaim } from './claim-cache.ts';

test('replaces both claim projections with the authoritative mutation result', () => {
    const item = claimItem();
    const claim = { ...item.claim, status: 'in_progress' as const, version: 2 };

    expect(replaceClaim({ backgroundCount: 2, claims: [item] }, claim)).toEqual({
        backgroundCount: 2,
        claims: [
            {
                ...item,
                message: { ...item.message, claim },
                claim,
            },
        ],
    });
});

function claimItem(): ClaimListItem {
    const claim: MessageClaim = {
        assigneeAgentId: null,
        chatId: 'chat_one',
        claimedAt: null,
        createdAt: '2026-07-26T12:00:00.000Z',
        createdByAgentId: null,
        createdByUserId: 'user_one',
        live: false,
        messageId: 'message_one',
        number: 1,
        origin: 'composed',
        status: 'todo',
        threadChatId: 'thread_one',
        tier: 'tracked',
        updatedAt: '2026-07-26T12:00:00.000Z',
        version: 1,
    };
    return {
        chatKind: 'channel',
        chatName: 'all',
        chatPeerUserId: null,
        message: {
            attachments: [],
            author: { kind: 'human', userId: 'user_one' },
            body: { kind: 'text' },
            chatId: 'chat_one',
            cloudAgentWork: [],
            imageGenerations: [],
            content: 'Claim',
            createdAt: '2026-07-26T12:00:00.000Z',
            id: 'message_one',
            nonce: 'nonce_one',
            reactions: [],
            reply: null,
            runId: null,
            sequence: 1,
            serverId: 'server_one',
            sessionGeneration: null,
            taskLinks: [],
            claim,
        },
        claim,
        threadSummary: {
            anchorMessageId: 'message_one',
            followed: false,
            latestReplyAt: null,
            recentReplies: [],
            replyCount: 0,
            threadChatId: 'thread_one',
            unreadCount: 0,
        },
    };
}
