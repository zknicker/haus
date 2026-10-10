import { describe, expect, test } from 'bun:test';
import {
    createRealtimeHarness,
    installRealtimeTestDom,
    invalidated,
    runRestarts,
} from '../../test-support/realtime-stream-harness.tsx';
import { useChatLifecycleStream } from './use-chat-lifecycle-stream.ts';
import { useChatReadStream } from './use-chat-read-stream.ts';
import { useCloudAgentWorkStream } from './use-cloud-agent-work-stream.ts';
import { useMessageCreatedStream } from './use-message-created-stream.ts';
import { useMessageReactionStream } from './use-message-reaction-stream.ts';
import { useTaskChangeStream } from './use-task-change-stream.ts';
import { useTaskLabelStream } from './use-task-label-stream.ts';
import { useThreadFollowStream } from './use-thread-follow-stream.ts';

installRealtimeTestDom();

const serverId = 'srv_1';

/**
 * Mounts one stream hook, starts it, delivers `event`, and returns the cache
 * ops the event caused; then fails the stream, restarts it, and returns the
 * ops its recovery caused.
 */
async function drive(path: string, useStream: (serverId: string) => void, event: unknown) {
    const harness = createRealtimeHarness();
    function Stream() {
        useStream(serverId);
        return null;
    }
    const mounted = await harness.mount(<Stream />);
    harness.start(path);
    // A first start recovers nothing: the App-wide passes own that.
    expect(harness.ops).toEqual([]);
    harness.emit(path, event);
    const onEvent = harness.ops.splice(0);
    harness.fail(path, 'INTERNAL_SERVER_ERROR');
    expect(runRestarts()).toBe(1);
    harness.start(path);
    const onRecovery = harness.ops.splice(0);
    await mounted.unmount();
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
            parentChatId: null,
            replyToAuthorUserId: null,
            sequence: 4,
            serverId,
            threadAnchorAuthorUserId: null,
            threadAnchorMessageId: null,
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
        ]);
        expect<unknown>(onRecovery[0]).toEqual(bulkLists);
        expect(invalidated(onRecovery)).toEqual(invalidated(onEvent));
    });

    test('chat.onMessageReactionUpdated invalidates the entity, search, active work, and tasks', async () => {
        const event = { chatId: 'cht_a', messageId: 'msg_1', parentChatId: null, serverId };
        const { onEvent, onRecovery } = await drive(
            'chat.onMessageReactionUpdated',
            useMessageReactionStream,
            event
        );
        expect<unknown>(onEvent[0]).toEqual({ op: 'noteMessageAnnotated', target: event });
        const reads = [
            listKey('chat.search', { serverId }),
            listKey('cloudAgentWork.listActive', { serverId }),
            listKey('task.list', { serverId }),
        ];
        expect(invalidated(onEvent)).toEqual(reads);
        expect<unknown>(onRecovery[0]).toEqual(bulkLists);
        expect(invalidated(onRecovery)).toEqual(reads);
    });

    test('chat.onRead of a Thread invalidates the Chat list and the anchor summary', async () => {
        const event = {
            chatId: 'cht_thread',
            parentChatId: 'cht_a',
            sequence: 2,
            serverId,
            threadAnchorMessageId: 'msg_anchor',
        };
        const { onEvent, onRecovery } = await drive(
            'chat.onRead',
            (id) => useChatReadStream(id),
            event
        );
        expect(invalidated(onEvent)).toEqual([listKey('chat.list', { serverId })]);
        expect<unknown>(onEvent.at(-1)).toEqual({
            op: 'noteMessageAnnotated',
            target: { chatId: 'cht_a', messageId: 'msg_anchor', serverId },
        });
        expect<unknown>(onRecovery[0]).toEqual(bulkLists);
        expect(invalidated(onRecovery)).toEqual([listKey('chat.list', { serverId })]);
    });

    test('thread.onFollowUpdated invalidates the anchor entity and the Chat list', async () => {
        const event = {
            anchorMessageId: 'msg_anchor',
            followed: true,
            parentChatId: 'cht_a',
            serverId,
            threadChatId: 'cht_thread',
        };
        const { onEvent, onRecovery } = await drive(
            'thread.onFollowUpdated',
            useThreadFollowStream,
            event
        );
        expect<unknown>(onEvent[0]).toEqual({
            op: 'noteMessageAnnotated',
            target: { chatId: 'cht_a', messageId: 'msg_anchor', serverId },
        });
        expect(invalidated(onEvent)).toEqual([listKey('chat.list', { serverId })]);
        expect<unknown>(onRecovery[0]).toEqual(bulkLists);
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
        ]);
        // Lifecycle owns no transcript lists: its recovery is its own table row.
        expect(onRecovery.some((entry) => entry.op === 'recoverTranscriptLists')).toBe(false);
        expect(invalidated(onRecovery)).toContainEqual(listKey('chat.get', { serverId }));
    });

    test('task.onChanged invalidates the task message entity and the task list', async () => {
        const event = { chatId: 'cht_a', kind: 'updated', messageId: 'msg_task', serverId };
        const { onEvent, onRecovery } = await drive('task.onChanged', useTaskChangeStream, event);
        expect<unknown>(onEvent[0]).toEqual({ op: 'noteMessageAnnotated', target: event });
        expect(invalidated(onEvent)).toEqual([listKey('task.list', { serverId })]);
        expect<unknown>(onRecovery[0]).toEqual(bulkLists);
        expect(invalidated(onRecovery)).toEqual([listKey('task.list', { serverId })]);
    });

    test('taskLabel.onUpdated refreshes label carriers, the catalog, and tasks', async () => {
        const event = { labelId: 'lbl_1', serverId };
        const { onEvent, onRecovery } = await drive(
            'taskLabel.onUpdated',
            useTaskLabelStream,
            event
        );
        expect<unknown>(onEvent[0]).toEqual({ event, op: 'noteTaskLabelUpdated' });
        const reads = [listKey('taskLabel.list', { serverId }), listKey('task.list', { serverId })];
        expect(invalidated(onEvent)).toEqual(reads);
        expect(onRecovery).toEqual(onRecovery.filter((entry) => entry.op === 'invalidate'));
        expect(invalidated(onRecovery)).toEqual(reads);
    });

    test('cloudAgentWork.onUpdated invalidates the work entity and both Chats work lists', async () => {
        const event = {
            chatId: 'cht_thread',
            messageId: 'msg_work',
            parentChatId: 'cht_a',
            serverId,
            workId: 'wrk_1',
        };
        const { onEvent, onRecovery } = await drive(
            'cloudAgentWork.onUpdated',
            useCloudAgentWorkStream,
            event
        );
        expect<unknown>(onEvent[0]).toEqual({
            op: 'noteMessageAnnotated',
            target: { chatId: 'cht_thread', messageId: 'msg_work', serverId },
        });
        expect(invalidated(onEvent)).toEqual([
            listKey('cloudAgentWork.listForChat', { chatId: 'cht_thread', serverId }),
            listKey('cloudAgentWork.listForChat', { chatId: 'cht_a', serverId }),
            listKey('cloudAgentWork.listActive', { serverId }),
        ]);
        expect<unknown>(onRecovery[0]).toEqual(bulkLists);
        expect(invalidated(onRecovery)).toEqual([
            listKey('cloudAgentWork.listForChat', { serverId }),
            listKey('cloudAgentWork.listActive', { serverId }),
        ]);
    });
});
