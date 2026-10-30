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
            // Any message can join an unread row's waiting messages (ADR 0050).
            listKey('chat.unreadPreviews', { serverId }),
        ]);
        expect<unknown>(onRecovery[0]).toEqual(bulkLists);
        // A missed Thread reply may have made a Thread unread (ADR 0043).
        expect(invalidated(onRecovery)).toEqual([
            listKey('chat.list', { serverId }),
            listKey('chat.search', { serverId }),
            listKey('thread.listUnread', { serverId }),
            listKey('chat.unreadPreviews', { serverId }),
        ]);
    });

    test('chat.onMessageCreated of a Thread reply also invalidates the unread Threads', async () => {
        const event = {
            authorUserId: null,
            chatId: 'cht_thread',
            conversationKind: 'channel',
            mentionedUserIds: [],
            messageId: 'msg_reply',
            parentChatId: 'cht_a',
            replyToAuthorUserId: null,
            sequence: 2,
            serverId,
            threadAnchorAuthorUserId: null,
            threadAnchorMessageId: 'msg_anchor',
        };
        const { onEvent } = await drive(
            'chat.onMessageCreated',
            (id) => useMessageCreatedStream(id),
            event
        );
        expect(invalidated(onEvent)).toEqual([
            listKey('chat.list', { serverId }),
            listKey('chat.search', { serverId }),
            listKey('thread.listUnread', { serverId }),
            listKey('chat.unreadPreviews', { serverId }),
        ]);
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

    test('chat.onRead of a Thread invalidates the unread Threads and the anchor summary', async () => {
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
        // A Thread is unread on its own: its read leaves the parent's row alone (ADR 0043).
        expect(invalidated(onEvent)).toEqual([
            listKey('thread.listUnread', { serverId }),
            listKey('chat.unreadPreviews', { serverId }),
        ]);
        expect<unknown>(onEvent.at(-1)).toEqual({
            op: 'noteMessageAnnotated',
            target: { chatId: 'cht_a', messageId: 'msg_anchor', serverId },
        });
        expect<unknown>(onRecovery[0]).toEqual(bulkLists);
        expect(invalidated(onRecovery)).toEqual([
            listKey('chat.list', { serverId }),
            listKey('thread.listUnread', { serverId }),
            listKey('chat.unreadPreviews', { serverId }),
        ]);
    });

    test('thread.onFollowUpdated invalidates the anchor entity and the unread Threads', async () => {
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
        const reads = [
            listKey('thread.listUnread', { serverId }),
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
            listKey('thread.listUnread', { serverId }),
            listKey('chat.unreadPreviews', { serverId }),
            // Linked Cloud Agent work may leave the viewer's lists (ADR 0044).
            listKey('cloudAgentWork.listAutomations', { serverId }),
            listKey('cloudAgentWork.listActive', { serverId }),
            listKey('cloudAgentWork.listForChat', { serverId }),
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
        // A missed rename may sit on any loaded message: lists recover too.
        expect<unknown>(onRecovery[0]).toEqual(bulkLists);
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
            listKey('cloudAgentWork.listAutomations', { serverId }),
            listKey('cloudAgentWork.listActive', { serverId }),
        ]);
        expect<unknown>(onRecovery[0]).toEqual(bulkLists);
        expect(invalidated(onRecovery)).toEqual([
            listKey('cloudAgentWork.listForChat', { serverId }),
            listKey('cloudAgentWork.listAutomations', { serverId }),
            listKey('cloudAgentWork.listActive', { serverId }),
        ]);
    });
});
