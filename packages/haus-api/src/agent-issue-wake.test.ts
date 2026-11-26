import { expect, test } from 'bun:test';
import { agentDeliveryRecordSchema, isChatlessInboxSource } from './agent-deliveries.ts';
import { agentStartCommandSchema } from './agent-delivery-frames.ts';
import { type AgentIssueAssignment, agentIssueEventSchema } from './agent-issue-wake.ts';
import { type AgentTurnTrigger, agentTurnTriggerSchema } from './agent-turn-trigger.ts';
import {
    issueAssignmentNotifiedUserId,
    issueCommentNotifiedUserIds,
    issueNotificationTitle,
} from './issue-notification.ts';

const assignment: AgentIssueAssignment = {
    by: '@ada',
    byAgent: false,
    code: 'GEN-12',
    id: 'issue-assign:iss_12:2',
    issueId: 'iss_12',
    priority: 'high',
    state: 'todo',
    title: 'Rotate the deploy key',
};

test('Issue items are chatless, and their run carries nothing but its attention', () => {
    expect(isChatlessInboxSource('issue_assignment')).toBe(true);
    expect(isChatlessInboxSource('issue_event')).toBe(true);
    expect(isChatlessInboxSource('task_assignment')).toBe(false);
    const delivery = {
        acceptedAt: null,
        agentId: 'agt_zero',
        chatId: null,
        createdAt: '2026-11-04T12:00:00.000Z',
        messageId: null,
        seenAt: null,
        servedAt: null,
        source: 'issue_assignment',
        state: 'queued',
        turnId: null,
        workId: assignment.id,
    } as const;
    expect(agentDeliveryRecordSchema.safeParse(delivery).success).toBe(true);
    expect(agentDeliveryRecordSchema.safeParse({ ...delivery, chatId: 'cht_1' }).success).toBe(
        false
    );
    const start = {
        agentId: 'agt_zero',
        agentName: 'zero',
        chatId: null,
        inboxDelivery: 'concrete',
        issueAssignments: [assignment],
        modelId: 'model',
        runId: 'run_1',
        runtimeId: 'claude',
        sessionGeneration: 1,
        totalPending: 0,
        type: 'start',
    };
    expect(agentStartCommandSchema.safeParse(start).success).toBe(true);
    expect(agentStartCommandSchema.safeParse({ ...start, chatId: 'cht_1' }).success).toBe(false);
});

test('an Issue event names a comment, a state change, or closed sub-issues', () => {
    const base = { ...assignment, id: 'issue-event:iss_12:iev_1' };
    const { priority: _priority, state: _state, ...event } = base;
    for (const change of [
        {
            body: 'Is the old key revoked?',
            commentId: 'icm_1',
            kind: 'commented',
            truncated: false,
        },
        { from: 'todo', kind: 'state_changed', to: 'done' },
        { kind: 'sub_issues_closed', total: 3 },
    ]) {
        expect(agentIssueEventSchema.safeParse({ ...event, change }).success).toBe(true);
    }
    expect(agentIssueEventSchema.safeParse({ ...base, change: { kind: 'other' } }).success).toBe(
        false
    );
});

test('an Issue run trigger names the Issue by code', () => {
    const trigger: AgentTurnTrigger = {
        code: 'GEN-12',
        issueId: 'iss_12',
        kind: 'issue',
        more: 2,
        title: 'Rotate the key',
    };
    expect(agentTurnTriggerSchema.parse(trigger)).toEqual(trigger);
    expect(agentTurnTriggerSchema.safeParse({ ...trigger, code: 'k3mq7xta' }).success).toBe(false);
});

test('an assignment notifies only a person someone else assigned', () => {
    const ada = { kind: 'user', userId: 'usr_ada' } as const;
    const zero = { agentId: 'agt_zero', kind: 'captain' } as const;
    expect(issueAssignmentNotifiedUserId({ actor: zero, assignee: ada })).toBe('usr_ada');
    expect(issueAssignmentNotifiedUserId({ actor: null, assignee: ada })).toBe('usr_ada');
    expect(issueAssignmentNotifiedUserId({ actor: ada, assignee: ada })).toBeNull();
    expect(issueAssignmentNotifiedUserId({ actor: ada, assignee: zero })).toBeNull();
    expect(
        issueCommentNotifiedUserIds({ author: ada, subscriberUserIds: ['usr_ada', 'usr_bo'] })
    ).toEqual(['usr_bo']);
    expect(issueNotificationTitle({ actorName: 'Ada', code: 'GEN-12', kind: 'assigned' })).toBe(
        'Ada assigned you GEN-12'
    );
    expect(issueNotificationTitle({ actorName: null, code: 'GEN-12', kind: 'commented' })).toBe(
        'Haus commented on GEN-12'
    );
});
