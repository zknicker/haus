import { expect, test } from 'bun:test';

import { agentTaskAssignmentSchema } from '@haus/api';

import {
    agentSubagentWakeAttentionResponseSchema,
    agentTaskAssignmentNoticeResponseSchema,
    agentTaskAssignmentsResponseSchema,
} from './agent-command-frames-response-schema.ts';

test('the Computer response schema tolerates an unknown field on a sub-agent wake attention', () => {
    const parsed = agentSubagentWakeAttentionResponseSchema.parse({
        createdAt: '2026-09-04T12:00:00.000Z',
        futureWakeField: true,
        id: 'wake_1',
    });
    expect(parsed.id).toBe('wake_1');
});

test('the Computer response schema tolerates an unknown field on a Task assignment notice', () => {
    const parsed = agentTaskAssignmentNoticeResponseSchema.parse({
        futureNoticeField: true,
        ids: ['tka_1'],
        total: 1,
    });
    expect(parsed.ids).toEqual(['tka_1']);
});

test('the canonical strict Task assignment schema rejects a field it does not know', () => {
    expect(() =>
        agentTaskAssignmentSchema.parse({
            assignedBy: 'ada',
            assignedByAgent: false,
            futureAssignmentField: true,
            id: 'tka_1',
            key: 'PROD-1',
            priority: 'medium',
            taskId: 'tsk_1',
            title: 'Fix the bug',
        })
    ).toThrow(/futureAssignmentField/);
});

test('the Computer response schema tolerates an unknown field on a Task assignment', () => {
    const parsed = agentTaskAssignmentsResponseSchema.parse([
        {
            assignedBy: 'ada',
            assignedByAgent: false,
            futureAssignmentField: true,
            id: 'tka_1',
            key: 'PROD-1',
            priority: 'medium',
            taskId: 'tsk_1',
            title: 'Fix the bug',
        },
    ]);
    expect(parsed[0]?.key).toBe('PROD-1');
});
