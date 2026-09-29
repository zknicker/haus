import { expect, test } from 'bun:test';
import type { QueryClient } from '@tanstack/react-query';
import { threadMessagesQueryKey } from '../use-thread-messages.ts';
import {
    cloudAgentWorkEvent,
    lifecycleEvent,
    messageEvent,
    reactionEvent,
    taskEvent,
    threadFollowEvent,
} from './chat-event-fixtures.ts';
import type { ChatEventUtils } from './chat-event-invalidation.ts';
import { invalidateChatLifecycle } from './use-chat-lifecycle-events.ts';
import { invalidateChatRead } from './use-chat-read-events.ts';
import { invalidateCloudAgentWorkChanges } from './use-cloud-agent-work-events.ts';
import { invalidateMessageCreated } from './use-message-created-events.ts';
import { invalidateMessageReactionChanges } from './use-message-reaction-events.ts';
import { invalidateTaskChanges } from './use-task-change-events.ts';
import { invalidateTaskLabelChanges } from './use-task-label-events.ts';
import { invalidateThreadFollow } from './use-thread-follow-events.ts';

interface Invalidation {
    input?: unknown;
    name: string;
    options?: unknown;
}

const serverId = 'server_one';

test('a message pass refetches the chat list, search, Needs you, and both transcript reads', async () => {
    const { queryClient, recorded, utils } = recordingCaches();

    await invalidateMessageCreated({
        events: [messageEvent('2', 'chat_thread', 'chat_parent')],
        queryClient,
        serverId,
        utils,
    });

    expect(recorded).toEqual([
        { input: { serverId }, name: 'chat.list' },
        { input: { serverId }, name: 'chat.search' },
        { input: { serverId }, name: 'inbox.needsYou' },
        { input: { chatId: 'chat_thread', serverId }, name: 'chat.messages' },
        { input: { chatId: 'chat_parent', serverId }, name: 'chat.messages' },
        {
            input: { queryKey: threadMessagesQueryKey(serverId, 'chat_thread') },
            name: 'threadMessages',
        },
    ]);
});

test('Needs you refetches only for a message that could address or answer for the viewer', async () => {
    const chats = [
        { id: 'chat_channel', kind: 'channel' as const },
        { id: 'chat_dm', kind: 'dm' as const },
    ];
    const needsYouFor = async (event: ReturnType<typeof messageEvent>) => {
        const { queryClient, recorded, utils } = recordingCaches({
            chats,
            viewerUserId: 'usr_viewer',
        });
        await invalidateMessageCreated({ events: [event], queryClient, serverId, utils });
        return recorded.some((entry) => entry.name === 'inbox.needsYou');
    };

    expect(await needsYouFor(messageEvent('2', 'chat_channel'))).toBe(false);
    expect(
        await needsYouFor(
            messageEvent('3', 'chat_thread', 'chat_channel', { authorUserId: 'usr_peer' })
        )
    ).toBe(false);
    expect(
        await needsYouFor(
            messageEvent('4', 'chat_channel', null, { mentionedUserIds: ['usr_viewer'] })
        )
    ).toBe(true);
    expect(
        await needsYouFor(messageEvent('5', 'chat_channel', null, { authorUserId: 'usr_viewer' }))
    ).toBe(true);
    expect(await needsYouFor(messageEvent('6', 'chat_thread', 'chat_dm'))).toBe(true);
    expect(
        await needsYouFor(
            messageEvent('8', 'chat_channel', null, { replyToAuthorUserId: 'usr_viewer' })
        )
    ).toBe(true);
    expect(
        await needsYouFor(
            messageEvent('9', 'chat_channel', null, { replyToAuthorUserId: 'usr_peer' })
        )
    ).toBe(false);
    // A message in a Thread on the viewer's message addresses them.
    expect(
        await needsYouFor(
            messageEvent('10', 'chat_thread', 'chat_channel', {
                authorUserId: 'usr_peer',
                threadAnchorAuthorUserId: 'usr_viewer',
            })
        )
    ).toBe(true);
    expect(
        await needsYouFor(
            messageEvent('11', 'chat_thread', 'chat_channel', {
                threadAnchorAuthorUserId: 'usr_peer',
            })
        )
    ).toBe(false);
    // A Chat the cache does not know yet refetches rather than hide a row.
    expect(await needsYouFor(messageEvent('7', 'chat_unknown'))).toBe(true);
});

test('a message burst refetches each Chat once', async () => {
    const { queryClient, recorded, utils } = recordingCaches();

    await invalidateMessageCreated({
        events: [
            messageEvent('2', 'chat_one'),
            messageEvent('3', 'chat_one'),
            messageEvent('4', 'chat_two'),
        ],
        queryClient,
        serverId,
        utils,
    });

    expect(recorded.filter((entry) => entry.name === 'chat.messages')).toEqual([
        { input: { chatId: 'chat_one', serverId }, name: 'chat.messages' },
        { input: { chatId: 'chat_two', serverId }, name: 'chat.messages' },
    ]);
    expect(recorded.filter((entry) => entry.name === 'threadMessages')).toHaveLength(2);
});

test('a reaction pass refetches message lenses and search, not read state', async () => {
    const { queryClient, recorded, utils } = recordingCaches();

    await invalidateMessageReactionChanges({
        events: [reactionEvent('12', 'chat_thread', 'chat_parent')],
        queryClient,
        serverId,
        utils,
    });

    expect(recorded).toEqual([
        { input: { serverId }, name: 'chat.search' },
        { input: { serverId }, name: 'cloudAgentWork.listActive' },
        { input: { chatId: 'chat_thread', serverId }, name: 'chat.messages' },
        { input: { chatId: 'chat_parent', serverId }, name: 'chat.messages' },
        { input: { serverId }, name: 'task.list', options: { refetchType: 'all' } },
        {
            input: { queryKey: threadMessagesQueryKey(serverId, 'chat_thread') },
            name: 'threadMessages',
        },
    ]);
});

test('a read pass refetches the chat list and the Needs you rows', async () => {
    const { recorded, utils } = recordingCaches();

    await invalidateChatRead({ serverId, utils });

    expect(recorded).toEqual([
        { input: { serverId }, name: 'chat.list' },
        { input: { serverId }, name: 'inbox.needsYou' },
    ]);
});

test('a lifecycle pass refetches chat lists, Needs you, the changed Chats, and Agent chat rows', async () => {
    const { recorded, utils } = recordingCaches();

    await invalidateChatLifecycle({
        events: [
            lifecycleEvent('5', 'chat_one', 'created'),
            lifecycleEvent('6', 'chat_one', 'updated'),
            lifecycleEvent('7', 'chat_two', 'archived'),
        ],
        serverId,
        utils,
    });

    expect(recorded).toEqual([
        { input: { serverId }, name: 'chat.list' },
        { input: { serverId }, name: 'agent.chats' },
        { input: { serverId }, name: 'chat.listArchived' },
        { input: { serverId }, name: 'inbox.needsYou' },
        { input: { chatId: 'chat_one', serverId }, name: 'chat.get' },
        { input: { chatId: 'chat_two', serverId }, name: 'chat.get' },
    ]);
});

test('a follow pass refetches the chat list and the parent transcript', async () => {
    const { recorded, utils } = recordingCaches();

    await invalidateThreadFollow({
        events: [threadFollowEvent('2', 'thread_one', 'chat_parent')],
        serverId,
        utils,
    });

    expect(recorded).toEqual([
        { input: { serverId }, name: 'chat.list' },
        { input: { chatId: 'chat_parent', serverId }, name: 'chat.messages' },
    ]);
});

test('a task pass refetches the task list and the affected transcripts, not the chat list', async () => {
    const { queryClient, recorded, utils } = recordingCaches();

    await invalidateTaskChanges({
        events: [taskEvent('3', 'chat_one', 'task.created'), taskEvent('4', 'chat_one')],
        queryClient,
        serverId,
        utils,
    });

    expect(recorded).toEqual([
        { input: { serverId }, name: 'task.list', options: { refetchType: 'all' } },
        { input: { chatId: 'chat_one', serverId }, name: 'chat.messages' },
        {
            input: { queryKey: threadMessagesQueryKey(serverId, 'chat_one') },
            name: 'threadMessages',
        },
    ]);
});

test('a task label pass refetches the label catalog and the task list only', async () => {
    const { recorded, utils } = recordingCaches();

    await invalidateTaskLabelChanges({ serverId, utils });

    expect(recorded).toEqual([
        { input: { serverId }, name: 'task.list', options: { refetchType: 'all' } },
        { input: { serverId }, name: 'taskLabel.list', options: { refetchType: 'all' } },
    ]);
});

test('a Cloud Agent work pass refetches the active list and both transcript reads', async () => {
    const { queryClient, recorded, utils } = recordingCaches();

    await invalidateCloudAgentWorkChanges({
        events: [cloudAgentWorkEvent('11', 'chat_thread', 'chat_parent')],
        queryClient,
        serverId,
        utils,
    });

    expect(recorded).toEqual([
        { input: { serverId }, name: 'cloudAgentWork.listActive' },
        { input: { chatId: 'chat_thread', serverId }, name: 'cloudAgentWork.listForChat' },
        { input: { chatId: 'chat_parent', serverId }, name: 'cloudAgentWork.listForChat' },
        { input: { chatId: 'chat_thread', serverId }, name: 'chat.messages' },
        { input: { chatId: 'chat_parent', serverId }, name: 'chat.messages' },
        {
            input: { queryKey: threadMessagesQueryKey(serverId, 'chat_thread') },
            name: 'threadMessages',
        },
    ]);
});

function recordingCaches(
    cached: { chats?: Array<{ id: string; kind: 'channel' | 'dm' }>; viewerUserId?: string } = {}
) {
    const recorded: Invalidation[] = [];
    const record = (name: string) => async (input?: unknown, options?: unknown) => {
        recorded.push(options === undefined ? { input, name } : { input, name, options });
    };
    const utils = {
        agent: { chats: { invalidate: record('agent.chats') } },
        chat: {
            get: { invalidate: record('chat.get') },
            list: { getData: () => cached.chats, invalidate: record('chat.list') },
            listArchived: { invalidate: record('chat.listArchived') },
            messages: { cancel: async () => {}, invalidate: record('chat.messages') },
            search: { invalidate: record('chat.search') },
        },
        cloudAgentWork: {
            listActive: { invalidate: record('cloudAgentWork.listActive') },
            listForChat: { invalidate: record('cloudAgentWork.listForChat') },
        },
        inbox: { needsYou: { invalidate: record('inbox.needsYou') } },
        member: {
            list: {
                getData: () =>
                    cached.viewerUserId === undefined
                        ? undefined
                        : { viewerUserId: cached.viewerUserId },
            },
        },
        task: { list: { invalidate: record('task.list') } },
        taskLabel: { list: { invalidate: record('taskLabel.list') } },
    } as unknown as ChatEventUtils;
    const queryClient = {
        cancelQueries: async () => {},
        invalidateQueries: record('threadMessages'),
    } as unknown as QueryClient;

    return { queryClient, recorded, utils };
}
