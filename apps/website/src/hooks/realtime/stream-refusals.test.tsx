import { describe, expect, test } from 'bun:test';
import type { MessageCreatedEvent } from '@haus/api';
import {
    createRealtimeHarness,
    installRealtimeTestDom,
    runRestarts,
} from '../../test-support/realtime-stream-harness.tsx';
import { useMemberUpdateStream } from './use-member-update-stream.ts';
import { useMessageCreatedStream } from './use-message-created-stream.ts';
import { useReminderStream } from './use-reminder-stream.ts';
import { useServerUpdateStream } from './use-server-update-stream.ts';

installRealtimeTestDom();

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const lost = { id: 'srv_lost', slug: 'lost-room' };
const kept = { id: 'srv_kept', slug: 'kept-room' };

function Streams({ onMessage }: { onMessage?: (event: MessageCreatedEvent) => void }) {
    return (
        <>
            <ServerStream server={lost} />
            <MemberStream server={lost} />
            <ServerStream server={kept} />
            <ActiveStreams onMessage={onMessage} />
        </>
    );
}

function ServerStream({ server }: { server: typeof lost }) {
    useServerUpdateStream(server);
    return null;
}

function MemberStream({ server }: { server: typeof lost }) {
    useMemberUpdateStream(server);
    return null;
}

function ActiveStreams({ onMessage }: { onMessage?: (event: MessageCreatedEvent) => void }) {
    useMessageCreatedStream(lost.id, onMessage);
    useReminderStream(lost.id);
    return null;
}

const allOpen = [
    'chat.onMessageCreated',
    'member.onUpdated',
    'reminder.onUpdated',
    'server.onUpdated',
    'server.onUpdated',
];

function seedTwoServers(harness: ReturnType<typeof createRealtimeHarness>) {
    for (const server of [lost, kept]) {
        const input = { serverId: server.id };
        harness.queryClient.setQueryData([['chat', 'list'], { input, type: 'query' }], []);
        harness.queryClient.setQueryData([['member', 'list'], { input, type: 'query' }], {});
        harness.queryClient.setQueryData(['haus-turn-outlines', server.id, 'agt_1'], []);
        harness.queryClient.setQueryData(
            [['server', 'bySlug'], { input: { slug: server.slug }, type: 'query' }],
            { id: server.id, slug: server.slug }
        );
    }
    harness.queryClient.setQueryData([['server', 'list'], { type: 'query' }], [lost, kept]);
}

describe('stream refusal classes', () => {
    test('membership_lost on the sentinel clears only that Server and closes its siblings', async () => {
        const harness = createRealtimeHarness();
        seedTwoServers(harness);
        await harness.mount(<Streams />);
        expect(harness.openPaths()).toEqual(allOpen);

        const sentinel = harness.streams.find(
            (stream) => stream.path === 'server.onUpdated' && stream.input.serverId === lost.id
        );
        await harness.act(() =>
            sentinel?.observer.error(harness.refusal('FORBIDDEN', 'membership_lost'))
        );
        await flush();

        // Every stream of the lost Server closed; the other Server's sentinel stays.
        expect(harness.openPaths()).toEqual(['server.onUpdated']);
        expect(harness.streams.find((stream) => !stream.closed)?.input.serverId).toBe(kept.id);
        expect(harness.ops).toEqual([{ op: 'purgeServer', scope: { serverId: lost.id } }]);
        const keys = harness.queryClient
            .getQueryCache()
            .getAll()
            .map((query) => JSON.stringify(query.queryKey));
        expect(keys.filter((key) => key.includes(lost.id) || key.includes(lost.slug))).toEqual([]);
        expect(keys.filter((key) => key.includes(kept.id) || key.includes(kept.slug))).toHaveLength(
            4
        );
        expect(keys).toContain(JSON.stringify([['server', 'list'], { type: 'query' }]));
        // A loss is final: nothing restarts.
        expect(runRestarts()).toBe(0);
    });

    test('role_required stops only that stream and clears nothing', async () => {
        const harness = createRealtimeHarness();
        seedTwoServers(harness);
        await harness.mount(<Streams />);

        harness.fail('reminder.onUpdated', 'FORBIDDEN', 'role_required');
        await flush();

        expect(runRestarts()).toBe(0);
        expect(harness.openPaths()).toEqual(
            allOpen.filter((path) => path !== 'reminder.onUpdated')
        );
        expect(harness.ops).toEqual([]);
        expect(harness.queryClient.getQueryCache().getAll()).toHaveLength(9);
    });

    test('UNAUTHORIZED refreshes the session once, then restarts and recovers', async () => {
        const harness = createRealtimeHarness();
        await harness.mount(<Streams />);
        harness.start('chat.onMessageCreated');

        harness.fail('chat.onMessageCreated', 'UNAUTHORIZED');
        await flush();
        expect(harness.sessionRefreshes()).toBe(1);
        expect(runRestarts()).toBe(1);
        harness.start('chat.onMessageCreated');

        expect(harness.ops[0]).toEqual({
            op: 'recoverTranscriptLists',
            scope: { serverId: lost.id },
        });
        expect(harness.ops.some((entry) => entry.op === 'purgeServer')).toBe(false);
    });

    test('an uncoded FORBIDDEN is not a refusal: the stream restarts', async () => {
        const harness = createRealtimeHarness();
        await harness.mount(<Streams />);

        harness.fail('chat.onMessageCreated', 'FORBIDDEN');
        await flush();

        expect(runRestarts()).toBe(1);
        expect(harness.openPaths()).toEqual(allOpen);
        expect(harness.ops.some((entry) => entry.op === 'purgeServer')).toBe(false);
    });
});

describe('message notification callback', () => {
    test('live events reach onEvent; a restart recovery never does', async () => {
        const heard: string[] = [];
        const harness = createRealtimeHarness();
        await harness.mount(<Streams onMessage={(event) => heard.push(event.messageId)} />);
        harness.start('chat.onMessageCreated');
        harness.emit('chat.onMessageCreated', {
            authorUserId: null,
            chatId: 'cht_dm',
            conversationKind: 'dm',
            mentionedUserIds: [],
            messageId: 'msg_live',
            parentChatId: null,
            replyToAuthorUserId: null,
            sequence: 1,
            serverId: lost.id,
            threadAnchorAuthorUserId: null,
            threadAnchorMessageId: null,
        });

        harness.fail('chat.onMessageCreated', 'INTERNAL_SERVER_ERROR');
        runRestarts();
        harness.start('chat.onMessageCreated');

        expect(heard).toEqual(['msg_live']);
        // One subscription carries both the cache work and the notifications.
        expect(harness.openPaths().filter((path) => path === 'chat.onMessageCreated')).toHaveLength(
            1
        );
    });
});
