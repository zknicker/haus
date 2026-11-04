import { expect, test } from 'bun:test';
import { agentNoticeCommandSchema, agentStartCommandSchema } from './agent-delivery-frames.ts';
import {
    agentTaskListQuerySchema,
    agentTaskMoveInputSchema,
    agentTaskUpdateInputSchema,
} from './agent-task.ts';
import { pushNotificationPayloadSchema, pushTaskAssignmentPayloadSchema } from './push.ts';
import {
    taskAssignmentNotificationTitle,
    taskAssignmentNotifiedUserId,
} from './task-notification.ts';

const person = { kind: 'user', userId: 'usr_bo' } as const;
const assigner = { kind: 'user', userId: 'usr_ada' } as const;
const agent = { agentId: 'agt_orbit', kind: 'agent' } as const;

test('a person is notified about work someone else handed them, and only then', () => {
    expect(taskAssignmentNotifiedUserId({ assignee: person, assigner })).toBe('usr_bo');
    expect(taskAssignmentNotifiedUserId({ assignee: person, assigner: agent })).toBe('usr_bo');
    expect(taskAssignmentNotifiedUserId({ assignee: person, assigner: person })).toBeNull();
    expect(taskAssignmentNotifiedUserId({ assignee: agent, assigner })).toBeNull();
    expect(taskAssignmentNotifiedUserId({ assignee: null, assigner })).toBeNull();
    expect(taskAssignmentNotificationTitle({ assignerName: 'Ada', key: 'SEC-12' })).toBe(
        'Ada assigned you SEC-12'
    );
});

test('a Task assignment push routes by Task and is not a message push', () => {
    const payload = {
        aps: {
            alert: { body: 'Rotate the key', title: 'Ada assigned you SEC-12' },
            sound: 'default',
            'thread-id': 'tsk_one',
        },
        key: 'SEC-12',
        kind: 'task_assignment',
        serverId: 'srv_one',
        taskId: 'tsk_one',
    };
    expect(pushTaskAssignmentPayloadSchema.safeParse(payload).success).toBe(true);
    expect(pushNotificationPayloadSchema.safeParse(payload).success).toBe(false);
    expect(
        pushTaskAssignmentPayloadSchema.safeParse({ ...payload, key: 'not-a-key' }).success
    ).toBe(false);
});

const assignment = {
    assignedBy: 'ada',
    assignedByAgent: false,
    board: 'Security',
    column: 'In progress',
    id: 'task-assign:tsk_one:2',
    key: 'SEC-12',
    priority: 'high',
    taskId: 'tsk_one',
    title: 'Rotate the key',
};

const taskStart = {
    agentId: 'agt_one',
    chatId: null,
    inboxDelivery: 'concrete',
    modelId: 'model',
    runId: 'run_one',
    runtimeId: 'codex',
    sessionGeneration: 1,
    taskAssignments: [assignment],
    totalPending: 0,
    type: 'start',
};

test('a Task assignment run is chatless and carries nothing else', () => {
    expect(agentStartCommandSchema.safeParse(taskStart).success).toBe(true);
    expect(agentStartCommandSchema.safeParse({ ...taskStart, chatId: 'cht_one' }).success).toBe(
        false
    );
    expect(agentStartCommandSchema.safeParse({ ...taskStart, taskAssignments: [] }).success).toBe(
        false
    );
    expect(
        agentStartCommandSchema.safeParse({
            ...taskStart,
            taskAssignments: Array.from({ length: 51 }, () => assignment),
        }).success
    ).toBe(false);
});

test('a notice carries inbox work, Task assignments, or both, never neither', () => {
    const notice = { agentId: 'agt_one', inbox: [], runId: 'run_one', totalPending: 0 };
    const frame = { ...notice, type: 'notice' };
    expect(agentNoticeCommandSchema.safeParse(frame).success).toBe(false);
    expect(
        agentNoticeCommandSchema.safeParse({
            ...frame,
            taskAssignments: { ids: [assignment.id], total: 70 },
        }).success
    ).toBe(true);
});

test('Agent task inputs take a category list, names, and at least one field to update', () => {
    expect(agentTaskListQuerySchema.parse({ category: 'todo,done' }).category).toEqual([
        'todo',
        'done',
    ]);
    expect(agentTaskListQuerySchema.safeParse({ category: 'todo,nope' }).success).toBe(false);
    expect(agentTaskListQuerySchema.safeParse({ assignee: 'zero' }).success).toBe(false);
    expect(agentTaskMoveInputSchema.safeParse({ column: 'Done', key: 'sec-12' }).success).toBe(
        false
    );
    expect(agentTaskUpdateInputSchema.safeParse({ key: 'SEC-12' }).success).toBe(false);
    expect(agentTaskUpdateInputSchema.safeParse({ dueOn: null, key: 'SEC-12' }).success).toBe(true);
});
