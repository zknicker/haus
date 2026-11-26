import { expect, test } from 'bun:test';
import type { ActiveWorker, Agent } from '@haus/api';
import { activeWorkLocations } from '../../../../../packages/haus-api/src/worker-fixture.ts';
import { humanDirectory } from '../servers/human-identity.ts';
import { workerTurnFixture, workerFixture } from '../workers/worker-fixture.ts';
import { happeningNowWorkSubline, toHappeningNowWork } from './happening-now-work.ts';

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
            id: 'caw_one',
            location: { chatId: 'chat_task', kind: 'task', taskId: 'tsk_12' },
            provider: 'cursor',
            state: 'working',
            statusText: 'Working · 7m',
            task: { id: 'tsk_12', shortId: 'k3mq7xta' },
            title: 'Fix the failing migration',
        },
    ]);
});

test('a Worker on a Computer reads with no provider, so its key prints the terminal alone', () => {
    const worker = {
        ...workRecord(),
        place: { computerId: 'cmp_mini', computerName: 'mini', kind: 'computer' as const },
    };
    const [row] = toHappeningNowWork([activeWork({ worker })], humans, agents, now);

    expect(row?.provider).toBeNull();
});

test('a Worker carries its Task, and its subline leads with the short id', () => {
    const [onTask] = toHappeningNowWork([activeWork()], humans, agents, now);

    expect(onTask?.task).toEqual({ id: 'tsk_12', shortId: 'k3mq7xta' });
    expect(onTask && happeningNowWorkSubline(onTask)).toBe(
        'Working · 7m · k3mq7xta · #product · Blippy'
    );
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

test('a retired Agent reads by the name the Server stored for it', () => {
    const [row] = toHappeningNowWork([activeWork({ agentName: 'Old Blippy' })], humans, [], now);

    expect(row?.agentName).toBe('Old Blippy');
});

test('the Server location is where the row opens', () => {
    for (const location of Object.values(activeWorkLocations)) {
        const [row] = toHappeningNowWork([activeWork({ location })], humans, agents, now);
        expect(row?.location).toEqual(location);
    }
});

test('a follow-up queued behind a finished Run reads as the waiting follow-up, not done', () => {
    const followedUp = workerFixture({
        turns: [
            workerTurnFixture({
                createdAt: '2026-09-04T12:05:00.000Z',
                turnId: 'car_two',
                status: 'queued',
            }),
            workerTurnFixture({ status: 'completed' }),
        ],
        status: 'queued',
    });
    const [row] = toHappeningNowWork([activeWork({ worker: followedUp })], humans, agents, now);

    expect(row?.state).toBe('working');
    expect(row?.statusText).toBe('Follow-up waiting · 2m');
});

function workRecord(overrides: Parameters<typeof workerFixture>[0] = {}): ActiveWorker['worker'] {
    return workerFixture({
        agentId: 'agent_blippy',
        updatedAt: '2026-09-04T12:06:00.000Z',
        ...overrides,
    });
}

function activeWork(overrides: Partial<ActiveWorker> = {}): ActiveWorker {
    return {
        agentName: 'Blippy',
        chatKind: 'channel',
        chatName: 'product',
        chatPeerUserId: null,
        conversationChatId: 'chat_product',
        location: { chatId: 'chat_task', kind: 'task', taskId: 'tsk_12' },
        taskId: 'tsk_12',
        taskShortId: 'k3mq7xta',
        worker: workRecord(),
        ...overrides,
    };
}
