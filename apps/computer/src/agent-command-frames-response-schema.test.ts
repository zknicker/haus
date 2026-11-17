import { expect, test } from 'bun:test';
import { agentHeartbeatAttentionSchema, agentTaskAssignmentSchema } from '@haus/api';
import {
    agentHeartbeatAttentionResponseSchema,
    agentHeartbeatReportAttentionResponseSchema,
    agentSubagentWakeAttentionResponseSchema,
    agentTaskAssignmentNoticeResponseSchema,
    agentTaskAssignmentsResponseSchema,
} from './agent-command-frames-response-schema.ts';

/**
 * A current Server's heartbeat attention, plus a field a future Server
 * release might additively send at every nesting level: the attention
 * itself, its digest entries, its leads, and its reminders.
 */
const heartbeatAttentionWithUnknownFields = {
    connections: [],
    createdAt: '2026-09-04T12:00:00.000Z',
    digest: {
        entries: [
            {
                addressed: true,
                afterSequence: 10,
                chatId: 'cht_product',
                futureDigestEntryField: true,
                kind: 'channel',
                lastSpeaker: 'ada',
                messageCount: 3,
                speakers: ['ada'],
                target: '#product',
                title: 'Product',
            },
        ],
        more: 0,
    },
    futureHeartbeatField: 'a field this Computer build predates',
    id: 'heartbeat:agt_orbit:2026-09-04:08:00',
    kind: 'daytime',
    leads: [{ agentHandle: 'orbit', futureLeadField: true, id: 'led_1', topic: 'A topic' }],
    reminders: [
        {
            fireAt: '2026-09-04T13:00:00.000Z',
            futureReminderField: true,
            id: 'rmd_1',
            title: 'A reminder',
        },
    ],
    since: null,
};

test('the canonical strict heartbeat attention schema rejects a field it does not know', () => {
    expect(() => agentHeartbeatAttentionSchema.parse(heartbeatAttentionWithUnknownFields)).toThrow(
        /futureHeartbeatField/
    );
});

test('the Computer response schema parses a heartbeat attention carrying fields from a newer Server, at every nesting level', () => {
    const parsed = agentHeartbeatAttentionResponseSchema.parse(heartbeatAttentionWithUnknownFields);
    expect(parsed.digest.entries[0]?.chatId).toBe('cht_product');
    expect(parsed.leads[0]?.id).toBe('led_1');
    expect(parsed.reminders[0]?.id).toBe('rmd_1');
});

test('the Computer response schema tolerates an unknown field on a heartbeat report attention', () => {
    const parsed = agentHeartbeatReportAttentionResponseSchema.parse({
        createdAt: '2026-09-04T12:00:00.000Z',
        futureReportField: true,
        heartbeatKind: 'daytime',
        heartbeatRunId: 'run_heartbeat',
        id: 'heartbeat-report:run_heartbeat',
        text: 'Checked the Etsy shop.',
    });
    expect(parsed.heartbeatRunId).toBe('run_heartbeat');
});

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
            board: 'Product',
            column: 'Doing',
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
            board: 'Product',
            column: 'Doing',
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
