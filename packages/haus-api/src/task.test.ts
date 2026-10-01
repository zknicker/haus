import { expect, test } from 'bun:test';
import { taskAssigneeRefSchema, taskCreateInputSchema } from './task.ts';
import { messageTaskSchema } from './task-shared.ts';

test('tasks are held by Agents only', () => {
    expect(taskAssigneeRefSchema.safeParse({ agentId: 'agt_orbit' }).success).toBe(true);
    expect(taskAssigneeRefSchema.safeParse({ kind: 'human', userId: 'usr_ada' }).success).toBe(
        false
    );
    expect(messageTaskSchema.shape).not.toHaveProperty('assigneeUserId');
    expect(
        taskCreateInputSchema.safeParse({
            assigneeUserId: 'usr_ada',
            chatId: 'cht_product',
            content: 'Ship it',
            nonce: 'n1',
            serverId: 'srv_1',
        }).success
    ).toBe(false);
});
