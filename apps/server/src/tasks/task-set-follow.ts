import type { TaskFollowReceipt, TaskSetFollowInput } from '@haus/api';
import { requireChatAccess } from '../chats/chat-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { taskFollowUpdatedTopic } from '../realtime/topics.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { TaskInvariantError } from './task-errors.ts';
import { setUserTaskFollow } from './task-follows.ts';
import { lockTask } from './task-read.ts';

/**
 * `task.setFollow`: a person follows or unfollows a Task by hand (ADR 0052
 * decision 9). Only someone who can see its origin Channel may follow it.
 */
export async function setTaskFollow(
    db: HausDatabase,
    member: HausUser | null,
    input: TaskSetFollowInput
): Promise<{ event: PreparedRealtimeEvent; receipt: TaskFollowReceipt }> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const task = await lockTask(tx, input.serverId, input.taskId);
        if (!task.chatId) {
            throw new TaskInvariantError('This Task has no conversation to follow.');
        }
        await requireChatAccess(tx, member, { chatId: task.chatId, serverId: input.serverId });
        if (!member) {
            throw new Error('Following a Task requires a Haus User.');
        }
        await setUserTaskFollow(tx, {
            chatId: task.chatId,
            followed: input.followed,
            serverId: input.serverId,
            userId: member.id,
        });
        const receipt = { followed: input.followed, serverId: input.serverId, taskId: task.id };
        return {
            event: taskFollowUpdatedTopic.prepare(
                { ...receipt, chatId: task.chatId },
                { audienceUserId: member.id }
            ),
            receipt,
        };
    });
}
