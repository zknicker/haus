import { describe, expect, test } from 'bun:test';
import {
    createRealtimeHarness,
    installRealtimeTestDom,
    invalidated,
    runRestarts,
} from '../../test-support/realtime-stream-harness.tsx';
import { useChatLifecycleStream } from './use-chat-lifecycle-stream.ts';
import { useChatReadStream } from './use-chat-read-stream.ts';
import { useClaimChangeStream } from './use-claim-change-stream.ts';
import { useMessageCreatedStream } from './use-message-created-stream.ts';
import { useMessageReactionStream } from './use-message-reaction-stream.ts';
import { useTaskLabelStream } from './use-task-label-stream.ts';

installRealtimeTestDom();

const serverId = 'srv_1';

/**
 * Mounts one stream hook, starts it, delivers `event`, and returns the cache
 * ops the event caused; then fails the stream, restarts it, and returns the
 * ops its recovery caused. The first start reconciles the same owned reads a
 * restart does (start-anchored recovery), and so does a plain resubscribe.
 */
async function drive(path: string, useStream: (serverId: string) => void, event: unknown) {
    const harness = createRealtimeHarness();
    function Stream() {
        useStream(serverId);
        return null;
    }
    const mounted = await harness.mount(<Stream />);
    harness.start(path);
    const onFirstStart = harness.ops.splice(0);
    harness.emit(path, event);
    const onEvent = harness.ops.splice(0);
    harness.fail(path, 'INTERNAL_SERVER_ERROR');
    expect(runRestarts()).toBe(1);
    harness.start(path);
    const onRecovery = harness.ops.splice(0);
    // A resubscribe on a reconnected socket starts without a failure first.
    harness.start(path);
    const onResubscribe = harness.ops.splice(0);
    await mounted.unmount();
    expect(onFirstStart).toEqual(onRecovery);
    expect(onResubscribe).toEqual(onRecovery);
    expect(onRecovery.length).toBeGreaterThan(0);
    return { onEvent, onRecovery };
}

const listKey = (path: string, input: Record<string, unknown>) => ({ input, path });
const bulkLists = { op: 'recoverTranscriptLists', scope: { serverId } };

describe('Chat stream hooks', () => {
    test('chat.onMessageCreated tail-reads lists and invalidates Chat ordering and search', async () => {
        const event = {
            authorUserId: null,
            chatId: 'cht_a',
            conversationKind: 'channel',
            mentionedUserIds: [],
            messageId: 'msg_1',
            replyToAuthorUserId: null,
            sequence: 4,
            serverId,
            taskId: null,
        };
        const { onEvent, onRecovery } = await drive(
            'chat.onMessageCreated',
            (id) => useMessageCreatedStream(id),
            event
        );
        expect<unknown>(onEvent[0]).toEqual({ event, op: 'noteMessageCreated' });
        expect(invalidated(onEvent)).toEqual([
            listKey('chat.list', { serverId }),
            listKey('chat.search', { serverId }),
            // Any message can join an unread row's waiting messages (ADR 0050).
            listKey('chat.unreadPreviews', { serverId }),
        ]);
        expect<unknown>(onRecovery[0]).toEqual(bulkLists);
        expect(invalidated(onRecovery)).toEqual([
            listKey('chat.list', { serverId }),
            listKey('chat.search', { serverId }),
            listKey('chat.unreadPreviews', { serverId }),
        ]);
    });

    test('chat.onMessageReactionUpdated invalidates the entity, search, and claims', async () => {
        const event = { chatId: 'cht_a', messageId: 'msg_1', serverId };
        const { onEvent, onRecovery } = await drive(
            'chat.onMessageReactionUpdated',
            useMessageReactionStream,
            event
        );
        expect<unknown>(onEvent[0]).toEqual({ op: 'noteMessageAnnotated', target: event });
        const reads = [
            listKey('chat.search', { serverId }),
            listKey('claim.list', { serverId }),
        ];
        expect(invalidated(onEvent)).toEqual(reads);
        expect<unknown>(onRecovery[0]).toEqual(bulkLists);
        expect(invalidated(onRecovery)).toEqual(reads);
    });

    test('chat.onRead of a Channel invalidates the Chat list and the unread previews', async () => {
        const event = { chatId: 'cht_a', sequence: 2, serverId, taskId: null };
        const { onEvent, onRecovery } = await drive(
            'chat.onRead',
            (id) => useChatReadStream(id),
            event
        );
        const reads = [
            listKey('chat.list', { serverId }),
            listKey('chat.unreadPreviews', { serverId }),
        ];
        expect(invalidated(onEvent)).toEqual(reads);
        expect<unknown>(onRecovery[0]).toEqual(bulkLists);
        expect(invalidated(onRecovery)).toEqual(reads);
    });

    test('chat.onLifecycle deleted purges the Chat and invalidates the Chat reads', async () => {
        const event = { action: 'deleted', chatId: 'cht_a', serverId };
        const { onEvent, onRecovery } = await drive(
            'chat.onLifecycle',
            useChatLifecycleStream,
            event
        );
        expect<unknown>(onEvent[0]).toEqual({
            op: 'purgeChat',
            scope: { chatId: 'cht_a', serverId },
        });
        expect(invalidated(onEvent)).toEqual([
            listKey('chat.list', { serverId }),
            listKey('chat.listArchived', { serverId }),
            listKey('chat.get', { chatId: 'cht_a', serverId }),
            listKey('agent.chats', { serverId }),
            listKey('chat.unreadPreviews', { serverId }),
        ]);
        // Lifecycle owns no transcript lists: its recovery is its own table row.
        expect(onRecovery.some((entry) => entry.op === 'recoverTranscriptLists')).toBe(false);
        expect(invalidated(onRecovery)).toContainEqual(listKey('chat.get', { serverId }));
    });

    test('claim.onChanged invalidates the claim message entity and the claim list', async () => {
        const event = { chatId: 'cht_a', kind: 'updated', messageId: 'msg_claim', serverId };
        const { onEvent, onRecovery } = await drive('claim.onChanged', useClaimChangeStream, event);
        expect<unknown>(onEvent[0]).toEqual({ op: 'noteMessageAnnotated', target: event });
        expect(invalidated(onEvent)).toEqual([listKey('claim.list', { serverId })]);
        expect<unknown>(onRecovery[0]).toEqual(bulkLists);
        expect(invalidated(onRecovery)).toEqual([listKey('claim.list', { serverId })]);
    });

    test('taskLabel.onUpdated refreshes only the label catalog', async () => {
        const { onEvent, onRecovery } = await drive('taskLabel.onUpdated', useTaskLabelStream, {
            labelId: 'lbl_1',
            serverId,
        });
        const reads = [listKey('taskLabel.list', { serverId })];
        expect(invalidated(onEvent)).toEqual(reads);
        // No message carries a label, so a missed rename leaves transcripts alone.
        expect(onRecovery.some((entry) => entry.op === 'recoverTranscriptLists')).toBe(false);
        expect(invalidated(onRecovery)).toEqual(reads);
    });
});
