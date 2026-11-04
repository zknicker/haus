import { expect, test } from 'bun:test';
import type { Agent, ClaimListItem } from '@haus/api';
import { testChat } from '../../chats/chat-fixtures.ts';
import { testAgent } from '../../members/agent-fixtures.ts';
import { humanDirectory } from '../human-identity.ts';
import {
    claimChatOptions,
    filterClaims,
    groupClaims,
    groupClaimsForList,
    resolveClaimView,
    toClaimItem,
} from './claim-model.ts';

const humans = humanDirectory([]);
test('projects a claim from its canonical message', () => {
    const claim = toClaimItem(item(), humans);

    expect(claim.id).toBe('message_one');
    expect(claim.title).toBe('Ship the Server board');
    expect(claim.threadChatId).toBe('thread_one');
    expect(claim.chatLabel).toBe('#all');
    expect(claim.claimedAt).toBeNull();
    expect(claim.threadSummary.replyCount).toBe(3);
});

test('a claim title reads references by label, not by target', () => {
    const claim = toClaimItem(
        item({
            content:
                'Ask [@Blippy](agent://agt_blippy) to fix\nthe avatar upload in [#product](chat://cht_one)',
        }),
        humans
    );

    expect(claim.title).toBe('Ask @Blippy to fix the avatar upload in #product');
});

test('filters claims by lifecycle without a second content store', () => {
    const todo = toClaimItem(item(), humans);
    const done = { ...todo, id: 'message_two', number: 2, status: 'done' as const, title: 'Docs' };

    expect(filterClaims([todo, done], { view: 'active' })).toEqual([todo]);
    expect(filterClaims([todo, done], { view: 'all' })).toEqual([todo, done]);
});

test('lets an explicit status outrank the resting active view', () => {
    const todo = toClaimItem(item(), humans);
    const done = { ...todo, id: 'message_two', number: 2, status: 'done' as const };
    const closed = { ...todo, id: 'message_three', number: 3, status: 'closed' as const };

    expect(filterClaims([todo, done, closed], { status: 'done', view: 'active' })).toEqual([done]);
    expect(filterClaims([todo, done, closed], { status: 'closed', view: 'active' })).toEqual([
        closed,
    ]);
    expect(filterClaims([todo, done, closed], { status: 'todo', view: 'active' })).toEqual([todo]);
    expect(filterClaims([todo, done, closed], { status: null, view: 'active' })).toEqual([todo]);
});

test('filters claims by label id', () => {
    const labeled = {
        ...toClaimItem(item(), humans),
        labels: [{ color: 'red' as const, id: 'lbl_one', name: 'Bug' }],
    };
    const bare = { ...toClaimItem(item(), humans), id: 'message_two', labels: [], number: 2 };

    expect(filterClaims([labeled, bare], { labelId: 'lbl_one', view: 'all' })).toEqual([labeled]);
    expect(filterClaims([labeled, bare], { labelId: null, view: 'all' })).toEqual([labeled, bare]);
});

test('groups every lifecycle column in stable order', () => {
    const groups = groupClaims([toClaimItem(item(), humans)]);

    expect(groups.map((group) => group.status)).toEqual([
        'todo',
        'in_progress',
        'in_review',
        'done',
        'closed',
    ]);
    expect(groups[0]?.claims).toHaveLength(1);
});

test('rests on the active view so finished work stays out of the default page', () => {
    expect(resolveClaimView(null)).toBe('active');
    expect(resolveClaimView('all')).toBe('all');
    expect(resolveClaimView('unassigned')).toBe('unassigned');
});

test('leads the list with the claims waiting on a person', () => {
    const groups = groupClaimsForList([toClaimItem(item(), humans)]);

    expect(groups.map((group) => group.key)).toEqual([
        'in_review',
        'stopped',
        'todo',
        'in_progress',
        'done',
        'closed',
    ]);
    expect(groups[0]?.title).toBe('Needs your review');
    expect(groups[1]?.title).toBe('Stopped before finishing');
    expect(groups[2]?.title).toBe('Todo');
});

test('a claim an Agent stopped short of finishing leaves In Progress for its own group', () => {
    const base = toClaimItem(item(), humans);
    const stalled = {
        ...base,
        id: 'message_stalled',
        live: false,
        origin: 'claimed' as const,
        status: 'in_progress' as const,
        tier: 'tracked' as const,
    };
    const running = { ...stalled, id: 'message_running', live: true };

    const groups = groupClaimsForList([stalled, running]);
    const byKey = new Map(
        groups.map((group) => [group.key, group.claims.map((claim) => claim.id)])
    );

    expect(byKey.get('stopped')).toEqual(['message_stalled']);
    expect(byKey.get('in_progress')).toEqual(['message_running']);
});

test('orders each status group by priority, urgent first and unset last', () => {
    const base = toClaimItem(item(), humans);
    const none = { ...base, id: 'message_none', number: 2 };
    const low = { ...base, id: 'message_low', number: 3, priority: 'low' as const };
    const urgent = { ...base, id: 'message_urgent', number: 4, priority: 'urgent' as const };

    const groups = groupClaims([none, low, urgent]);

    expect(groups[0]?.claims.map((claim) => claim.id)).toEqual([
        'message_urgent',
        'message_low',
        'message_none',
    ]);
});

test('projects the assignee avatar from the agent directory', () => {
    const assigned = {
        ...item(),
        claim: { ...item().claim, assigneeAgentId: 'agent_owner' },
    };

    const claim = toClaimItem(assigned, humans, [agent()]);

    expect(claim.assigneeLabel).toBe('Fen');
    expect(claim.assigneeAvatarUrl).toBe('/api/avatars/avt_fen');
    expect(toClaimItem(item(), humans).assigneeAvatarUrl).toBeNull();
});

test('treats Agent-owned claims as assigned in claim filters', () => {
    const claim = { ...toClaimItem(item(), humans), assigneeAgentId: 'agent_owner' };

    expect(filterClaims([claim], { view: 'unassigned' })).toEqual([]);
});

test('offers writable Channels and DMs as claim creation work surfaces', () => {
    expect(
        claimChatOptions(
            [
                testChat({
                    id: 'chat_channel',
                    isAll: true,
                    name: 'all',
                    participantUserIds: ['user_viewer'],
                }),
                testChat({
                    id: 'chat_dm',
                    kind: 'dm',
                    name: null,
                    participantUserIds: ['user_viewer', 'user_peer'],
                    peerUserId: 'user_peer',
                }),
                testChat({
                    id: 'chat_agent_dm',
                    kind: 'dm',
                    name: null,
                    participantUserIds: ['user_viewer'],
                    peerAgentDisplayName: 'Cove',
                    peerAgentId: 'agent_cove',
                }),
                testChat({
                    id: 'chat_retired_agent_dm',
                    kind: 'dm',
                    name: null,
                    participantUserIds: ['user_viewer'],
                    peerAgentDisplayName: 'Fen',
                    peerAgentId: 'agent_fen',
                    peerAgentRetired: true,
                }),
            ],
            humans
        )
    ).toEqual([
        { id: 'chat_channel', label: '#all' },
        { id: 'chat_dm', label: 'DM · Human r_peer' },
        { id: 'chat_agent_dm', label: 'DM · Cove' },
    ]);
});

test('identifies a DM claim by its peer', () => {
    expect(
        toClaimItem(
            {
                ...item(),
                chatKind: 'dm',
                chatName: null,
                chatPeerUserId: 'user_peer',
            },
            humans
        ).chatLabel
    ).toBe('DM · Human r_peer');
});

test('a claim in an Agent DM reads as a DM without inventing a human peer', () => {
    expect(
        toClaimItem({ ...item(), chatKind: 'dm', chatName: null, chatPeerUserId: null }, humans)
            .chatLabel
    ).toBe('DM');
});

function agent(): Agent {
    return testAgent({
        avatarUrl: '/api/avatars/avt_fen',
        createdAt: '2026-07-26T12:00:00.000Z',
        effectiveModelId: null,
        effectiveReasoningEffort: null,
        effectiveReportedAt: null,
        effectiveRuntimeId: null,
        hausAgent: {
            appliedAt: null,
            appliedVersion: null,
            currentVersion: '1.0.0',
            status: 'pending',
        },
        id: 'agent_owner',
        status: 'pending',
    });
}

function item(overrides: { content?: string } = {}): ClaimListItem {
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
            content: overrides.content ?? 'Ship the Server board',
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
        },
        claim: {
            assigneeAgentId: null,
            chatId: 'chat_one',
            claimedAt: null,
            createdAt: '2026-07-26T12:00:00.000Z',
            createdByAgentId: null,
            createdByUserId: 'user_one',
            labels: [],
            live: false,
            messageId: 'message_one',
            number: 1,
            origin: 'composed',
            priority: 'none',
            status: 'todo',
            threadChatId: 'thread_one',
            tier: 'tracked',
            updatedAt: '2026-07-26T12:00:00.000Z',
            version: 1,
        },
        threadSummary: {
            anchorMessageId: 'message_one',
            followed: false,
            latestReplyAt: '2026-07-26T12:05:00.000Z',
            recentReplies: [],
            replyCount: 3,
            threadChatId: 'thread_one',
            unreadCount: 2,
        },
    };
}
