import { expect, test } from 'bun:test';

import type { ChatMessage, TaskPreview } from '@haus/api';
import { QueryClient } from '@tanstack/react-query';

import {
    type ChatMessageEntry,
    chatMessageQueryKey,
    seedChatMessageEntities,
} from '../servers/chat-message-entities.ts';
import type { ChatMessagePage } from '../servers/chat-message-layout.ts';
import { findTaskPreviewOrigin } from './task-preview-cache.ts';

const serverId = 'srv_1';
const chatId = 'cht_security';
const message = (id: string) => ({ chatId, id, serverId }) as ChatMessage;
const preview = (taskId: string, originMessageId: string) =>
    ({ originMessageId, taskId }) as TaskPreview;
const page = (messages: ChatMessage[], tasks: TaskPreview[]) =>
    ({ messages, tasks }) as ChatMessagePage;
const tasksOf = (client: QueryClient, messageId: string) =>
    client.getQueryData<ChatMessageEntry>(chatMessageQueryKey(serverId, chatId, messageId))?.tasks;

test('a page seeds each origin Message entity with its Tasks, the one copy previews read', () => {
    const client = new QueryClient();
    seedChatMessageEntities(
        client,
        page(
            [message('msg_1'), message('msg_2'), message('msg_3')],
            [preview('tsk_a', 'msg_1'), preview('tsk_b', 'msg_1'), preview('tsk_c', 'msg_3')]
        )
    );
    expect(tasksOf(client, 'msg_1')).toEqual([
        preview('tsk_a', 'msg_1'),
        preview('tsk_b', 'msg_1'),
    ]);
    expect(tasksOf(client, 'msg_2')).toEqual([]);
    expect(tasksOf(client, 'msg_3')).toEqual([preview('tsk_c', 'msg_3')]);
    expect(findTaskPreviewOrigin(client, serverId, 'tsk_c')).toBe(chatId);
    expect(findTaskPreviewOrigin(client, serverId, 'tsk_missing')).toBeNull();
    expect(findTaskPreviewOrigin(client, 'srv_other', 'tsk_c')).toBeNull();
    expect(client.getQueryCache().findAll({ queryKey: ['taskPreviews'] })).toHaveLength(0);
});

test('a reread that no longer carries a Task clears the origin it held', () => {
    const client = new QueryClient();
    seedChatMessageEntities(client, page([message('msg_1')], [preview('tsk_a', 'msg_1')]));
    seedChatMessageEntities(client, page([message('msg_1')], []));
    expect(tasksOf(client, 'msg_1')).toEqual([]);
    expect(findTaskPreviewOrigin(client, serverId, 'tsk_a')).toBeNull();
});
