import { expect, test } from 'bun:test';
import type { ActiveCloudAgentWork, Agent } from '@haus/api';
import {
    cloudAgentRunFixture,
    cloudAgentWorkFixture,
} from '../../cloud-agents/cloud-agent-work-fixture.ts';
import { humanDirectory } from '../human-identity.ts';
import { toHappeningNowWork } from './happening-now-work.ts';

const humans = humanDirectory(
    [{ displayName: 'Zach', handle: 'zach', userId: 'user_me' } as never],
    'user_me'
);
const agents = [{ displayName: 'Blippy', id: 'agent_blippy' } as Agent];
const now = Date.parse('2026-09-04T12:07:00.000Z');

test('a channel work reads its title, ticking status, Chat, and live Agent name', () => {
    expect(toHappeningNowWork([activeWork()], humans, agents, now)).toEqual([
        {
            agentName: 'Blippy',
            chatLabel: '#product',
            id: 'message_one',
            provider: 'cursor',
            state: 'working',
            statusText: 'Working · 7m',
            title: 'Fix the failing migration',
        },
    ]);
});

test('a DM work names the human peer, and an Agent DM names neither', () => {
    const [withPeer] = toHappeningNowWork(
        [activeWork({ chatKind: 'dm', chatName: null, chatPeerUserId: 'user_me' })],
        humans,
        agents,
        now
    );
    const [withoutPeer] = toHappeningNowWork(
        [activeWork({ chatKind: 'dm', chatName: null, chatPeerUserId: null })],
        humans,
        agents,
        now
    );

    expect(withPeer?.chatLabel).toBe('DM · Zach');
    expect(withoutPeer?.chatLabel).toBe('DM');
});

test('a retired Agent falls back to the name stored on its own Message', () => {
    const [row] = toHappeningNowWork([activeWork()], humans, [], now);

    expect(row?.agentName).toBe('Blippy (stored)');
});

test('a follow-up queued behind a finished Run reads as the waiting follow-up, not done', () => {
    const followedUp = cloudAgentWorkFixture({
        runs: [
            cloudAgentRunFixture({
                createdAt: '2026-09-04T12:05:00.000Z',
                runId: 'car_two',
                status: 'queued',
            }),
            cloudAgentRunFixture({ status: 'completed' }),
        ],
        status: 'queued',
    });
    const [row] = toHappeningNowWork([activeWork({ work: followedUp })], humans, agents, now);

    expect(row?.state).toBe('working');
    expect(row?.statusText).toBe('Follow-up waiting · 2m');
});

function workRecord(
    overrides: Partial<ActiveCloudAgentWork['work']> = {}
): ActiveCloudAgentWork['work'] {
    return cloudAgentWorkFixture({
        agentId: 'agent_blippy',
        chatId: 'chat_product',
        messageId: 'message_one',
        updatedAt: '2026-09-04T12:06:00.000Z',
        ...overrides,
    });
}

function activeWork(overrides: Partial<ActiveCloudAgentWork> = {}): ActiveCloudAgentWork {
    return {
        chatKind: 'channel',
        chatName: 'product',
        chatPeerUserId: null,
        conversationChatId: 'chat_product',
        message: {
            author: {
                agentId: 'agent_blippy',
                kind: 'agent',
                profile: {
                    avatarUrl: null,
                    deleted: false,
                    description: null,
                    displayName: 'Blippy (stored)',
                },
            },
            id: 'message_one',
        } as ActiveCloudAgentWork['message'],
        threadAnchorMessage: null,
        threadChatId: 'chat_thread',
        work: workRecord(),
        ...overrides,
    };
}
