import { describe, expect, test } from 'bun:test';
import { agentTriggerCreateInputSchema, agentTriggerSchema } from './agent-triggers.ts';
import {
    linearTriggerGroupsInputSchema,
    linearTriggerGroupsSchema,
    linearTriggerProblemSchema,
} from './linear-trigger-events.ts';
import { triggerCreateInputSchema, triggerSchema, triggerUpdateInputSchema } from './triggers.ts';

const linearTrigger = {
    anchorChatId: 'cht_dm',
    anchorMessageId: 'msg_ask',
    createdAt: '2026-10-15T12:00:00.000Z',
    createdByHandle: null,
    createdByUserId: null,
    disabledAt: null,
    fireCount: 0,
    id: 'trg_ln',
    instruction: null,
    kind: 'linear',
    lastFiredAt: null,
    linear: {
        connectionId: 'mcp_linear',
        display: { 'state-review': 'Design Review', 'team-des': 'Design' },
        groups: [
            {
                actions: ['update'],
                delegates: [{ agent: 'agt_juniper' }],
                event: 'issue',
                stateTo: ['state-review'],
                teams: ['team-des'],
            },
        ],
        problem: null,
        problemSince: null,
        selfSuppressedCount: 2,
        suppressedCount: 0,
        workspaceName: 'Haus',
    },
    ownerAgentId: 'agt_juniper',
    ownerHandle: 'juniper',
    status: 'armed',
    title: 'Design needs review',
    updatedAt: '2026-10-15T12:00:00.000Z',
    version: 1,
};

describe('linear trigger events', () => {
    test('fills each event default action', () => {
        expect(
            linearTriggerGroupsSchema.parse([
                { event: 'issue' },
                { event: 'comment' },
                { event: 'project' },
            ])
        ).toEqual([
            { actions: ['create'], event: 'issue' },
            { actions: ['create'], event: 'comment' },
            { actions: ['update'], event: 'project' },
        ]);
    });

    test('a label change is an issue update, never a derived event', () => {
        expect(linearTriggerGroupsSchema.safeParse([{ event: 'issue_label' }]).success).toBe(false);
        expect(
            linearTriggerGroupsSchema.parse([
                { actions: ['update'], changed: ['labels'], event: 'issue' },
            ])
        ).toEqual([{ actions: ['update'], changed: ['labels'], event: 'issue' }]);
    });

    test('keeps each filter on the events that take it', () => {
        expect(
            linearTriggerGroupsSchema.safeParse([{ event: 'comment', stateTo: ['s1'] }]).success
        ).toBe(false);
        expect(
            linearTriggerGroupsSchema.safeParse([{ changed: ['sortOrder'], event: 'issue' }])
                .success
        ).toBe(false);
        expect(
            linearTriggerGroupsSchema.safeParse([
                { event: 'comment', onIssueDelegatedTo: [{ agent: 'agt_juniper' }] },
            ]).success
        ).toBe(true);
    });

    test('stores Agent selectors as Haus Agent ids, never handles', () => {
        expect(
            linearTriggerGroupsSchema.safeParse([{ delegates: ['@self'], event: 'issue' }]).success
        ).toBe(false);
        expect(
            linearTriggerGroupsSchema.safeParse([
                { actors: [{ linearUser: 'usr-1' }, { agent: 'agt_beacon' }], event: 'issue' },
            ]).success
        ).toBe(true);
    });

    test('authoring accepts names and Agent selectors', () => {
        expect(
            linearTriggerGroupsInputSchema.parse([
                {
                    delegates: ['@self', '@agent:beacon'],
                    event: 'issue',
                    stateTo: ['Design Review'],
                    teams: ['DES'],
                },
            ])
        ).toEqual([
            {
                actions: ['create'],
                delegates: ['@self', '@agent:beacon'],
                event: 'issue',
                stateTo: ['Design Review'],
                teams: ['DES'],
            },
        ]);
        expect(
            linearTriggerGroupsInputSchema.safeParse([{ delegates: ['juniper'], event: 'issue' }])
                .success
        ).toBe(false);
    });

    test('bounds groups and filter lists', () => {
        const group = { event: 'issue' };
        expect(linearTriggerGroupsSchema.safeParse([]).success).toBe(false);
        expect(
            linearTriggerGroupsSchema.safeParse(Array.from({ length: 11 }, () => group)).success
        ).toBe(false);
        expect(
            linearTriggerGroupsSchema.safeParse([
                { event: 'issue', teams: Array.from({ length: 21 }, (_, i) => `t${i}`) },
            ]).success
        ).toBe(false);
    });

    test('names its problems most fundamental first', () => {
        expect(linearTriggerProblemSchema.options).toEqual([
            'workspace_removed',
            'sign_in_required',
            'agent_access_revoked',
            'teams_unavailable',
            'references_unavailable',
        ]);
    });
});

describe('linear triggers on the wire', () => {
    test('the Trigger union carries the linear kind', () => {
        expect(triggerSchema.parse(linearTrigger).kind).toBe('linear');
        expect(agentTriggerSchema.parse({ ...linearTrigger, anchorTarget: '#design' }).kind).toBe(
            'linear'
        );
    });

    test('a removed workspace leaves the Trigger explainable without a connection', () => {
        const removed = {
            ...linearTrigger,
            linear: {
                ...linearTrigger.linear,
                connectionId: null,
                problem: 'workspace_removed',
                problemSince: '2026-10-15T13:00:00.000Z',
            },
        };
        expect(triggerSchema.parse(removed).kind).toBe('linear');
    });

    test('create and update take authoring groups', () => {
        const linear = { connectionId: 'mcp_linear', groups: [{ event: 'issue' }] };
        expect(
            triggerCreateInputSchema.parse({
                agentId: 'agt_juniper',
                kind: 'linear',
                linear,
                serverId: 'srv_1',
                title: 'New issues',
            }).kind
        ).toBe('linear');
        expect(
            agentTriggerCreateInputSchema.parse({
                kind: 'linear',
                linear: { groups: linear.groups, workspace: 'acme' },
                messageId: 'msg_ask',
                title: 'New issues',
            }).kind
        ).toBe('linear');
        expect(
            triggerUpdateInputSchema.safeParse({ linear, serverId: 'srv_1', triggerId: 'trg_ln' })
                .success
        ).toBe(true);
    });
});
