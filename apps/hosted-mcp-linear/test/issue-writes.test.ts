import { describe, expect, test } from 'bun:test';
import { linearClientEntityId } from '@haus/api/linear-actor-meta';
import {
    callTool,
    data,
    fakeLinear,
    identityMeta,
    issueNode,
    linearError,
    workspaceMeta,
} from './fake-linear.ts';

const teamId = '9d1f6d38-2d55-4c8e-a3f5-6a7e1f3e8b10';
const op0 = linearClientEntityId(workspaceMeta.idSeed, 0);
const op1 = linearClientEntityId(workspaceMeta.idSeed, 1);
const comment = (id: string) => ({
    body: 'Looks good',
    botActor: null,
    createdAt: '2026-10-15T12:01:00.000Z',
    id,
    parent: null,
    updatedAt: '2026-10-15T12:01:00.000Z',
    url: `https://linear.app/haus-chat/issue/DES-142#comment-${id}`,
    user: null,
});

describe('create_issue', () => {
    test('creates with the derived id and the Agent attribution on the workspace actor', async () => {
        const linear = fakeLinear({
            CreateIssue: (variables) =>
                data({
                    issueCreate: {
                        issue: { ...issueNode, id: (variables.input as { id: string }).id },
                        success: true,
                    },
                }),
            TeamByKey: () => data({ teams: { nodes: [{ id: teamId }] } }),
        });
        const { report, result } = await callTool(linear, 'create_issue', {
            labels: ['label-review'],
            team: 'DES',
            title: 'Cat dad tee',
        });
        expect(linear.requests.map((request) => request.operation)).toEqual([
            'TeamByKey',
            'CreateIssue',
        ]);
        expect(linear.requests[1]?.variables.input).toEqual({
            createAsUser: 'Juniper',
            displayIconUrl: workspaceMeta.actor.displayIconUrl,
            id: op0,
            labelIds: ['label-review'],
            teamId,
            title: 'Cat dad tee',
        });
        expect(result.structuredContent.issue).toMatchObject({ id: op0, identifier: 'DES-142' });
        expect(report).toEqual({
            completed: true,
            mutations: [
                {
                    clientId: op0,
                    created: true,
                    entityId: op0,
                    entityType: 'issue',
                    fields: { labelIds: ['label-review'], teamId, title: 'Cat dad tee' },
                    opIndex: 0,
                    replayed: false,
                    updatedAt: issueNode.updatedAt,
                },
            ],
        });
    });

    test('an identity actor posts as itself, without createAsUser', async () => {
        const linear = fakeLinear({
            CreateIssue: () => data({ issueCreate: { issue: issueNode, success: true } }),
        });
        await callTool(linear, 'create_issue', { team: teamId, title: 'Tee' }, identityMeta);
        expect(linear.requests[0]?.variables.input).toEqual({ id: op0, teamId, title: 'Tee' });
    });

    test('"already exists" on a resend reads the issue back as success', async () => {
        const linear = fakeLinear({
            CreateIssue: () =>
                linearError('INPUT_ERROR', `Entity Issue with id ${op0} already exists`),
            Issue: (variables) => data({ issue: { ...issueNode, id: variables.id } }),
        });
        const { report, result } = await callTool(linear, 'create_issue', {
            team: teamId,
            title: 'Tee',
        });
        expect(result.isError).toBe(false);
        expect(linear.requests[1]?.variables).toEqual({ id: op0 });
        expect(report.mutations[0]).toMatchObject({ entityId: op0, replayed: true });
    });
});

describe('update_issue', () => {
    test('updates the issue then posts the note as op 1', async () => {
        const linear = fakeLinear({
            CreateComment: (variables) =>
                data({
                    commentCreate: {
                        comment: comment((variables.input as { id: string }).id),
                        success: true,
                    },
                }),
            UpdateIssue: () => data({ issueUpdate: { issue: issueNode, success: true } }),
        });
        const { report } = await callTool(linear, 'update_issue', {
            issue: 'DES-142',
            note: 'Ready for print.',
            project: null,
            state: 'state-print',
        });
        expect(linear.requests[0]?.variables).toEqual({
            id: 'DES-142',
            input: { projectId: null, stateId: 'state-print' },
        });
        expect(linear.requests[1]?.variables.input).toEqual({
            body: 'Ready for print.',
            createAsUser: 'Juniper',
            displayIconUrl: workspaceMeta.actor.displayIconUrl,
            id: op1,
            issueId: issueNode.id,
        });
        expect(report.mutations).toMatchObject([
            { created: false, entityId: issueNode.id, entityType: 'issue', opIndex: 0 },
            { clientId: op1, created: true, entityType: 'comment', opIndex: 1 },
        ]);
    });

    test('an update with nothing to change is refused before Linear', async () => {
        const linear = fakeLinear({});
        const { result } = await callTool(linear, 'update_issue', { issue: 'DES-142' });
        expect(result.structuredContent).toMatchObject({ error: { code: 'linear_input_error' } });
        expect(linear.requests).toHaveLength(0);
    });
});

test('create_comment resolves an identifier and replies under a parent', async () => {
    const linear = fakeLinear({
        CreateComment: () => data({ commentCreate: { comment: comment(op0), success: true } }),
        IssueId: () => data({ issue: { id: issueNode.id } }),
    });
    const { report } = await callTool(linear, 'create_comment', {
        body: 'Looks good',
        issue: 'DES-142',
        parent: 'comment-parent',
    });
    expect(linear.requests[1]?.variables.input).toMatchObject({
        id: op0,
        issueId: issueNode.id,
        parentId: 'comment-parent',
    });
    expect(report.mutations[0]).toMatchObject({ entityType: 'comment', opIndex: 0 });
});

describe('delegate_issue', () => {
    const delegation = {
        delegateId: 'app-user-beacon',
        labelGroupId: 'label-agent-group',
        labelId: 'label-beacon',
    };

    test('swaps the Agent label in its group and sets the delegate', async () => {
        const linear = fakeLinear({
            DelegateIssue: () => data({ issueUpdate: { issue: issueNode, success: true } }),
            IssueLabels: () =>
                data({
                    issue: {
                        id: issueNode.id,
                        labels: {
                            nodes: [
                                { id: 'label-juniper', parent: { id: 'label-agent-group' } },
                                { id: 'label-review', parent: null },
                            ],
                        },
                    },
                }),
        });
        const { report } = await callTool(
            linear,
            'delegate_issue',
            { agent: 'agt_BBBBBBBBBBBBBBBB', issue: 'DES-142' },
            { delegation }
        );
        const fields = {
            delegateId: 'app-user-beacon',
            labelIds: ['label-review', 'label-beacon'],
        };
        expect(linear.requests[1]?.variables).toEqual({ id: issueNode.id, input: fields });
        expect(report.mutations).toMatchObject([{ entityType: 'issue', fields, opIndex: 0 }]);
    });

    test('a pending target label still sets the delegate', async () => {
        const linear = fakeLinear({
            DelegateIssue: () => data({ issueUpdate: { issue: issueNode, success: true } }),
            IssueLabels: () => data({ issue: { id: issueNode.id, labels: { nodes: [] } } }),
        });
        await callTool(
            linear,
            'delegate_issue',
            { agent: 'agt_BBBBBBBBBBBBBBBB', issue: 'DES-142' },
            { delegation: { ...delegation, labelId: null } }
        );
        expect(linear.requests[1]?.variables.input).toEqual({
            delegateId: 'app-user-beacon',
            labelIds: [],
        });
    });
});
