import { describe, expect, test } from 'bun:test';
import type { AgentIssueRow } from '@haus/api';
import type { ParsedArgs } from '../parse.ts';
import {
    runIssueComment,
    runIssueCreate,
    runIssueList,
    runIssueShow,
    runIssueUpdate,
} from './agent-issue-actions.ts';
import type { IssueDeps } from './agent-issue-view.ts';
import { args, harness } from './agent-task-test-fixtures.ts';

const issue: AgentIssueRow = {
    assignee: { handle: 'orbit', kind: 'captain' },
    closedSubIssueCount: 1,
    code: 'GEN-12',
    createdAt: '2026-11-26T09:00:00.000Z',
    creator: { handle: 'ada', kind: 'user' },
    dueOn: null,
    labels: ['Security'],
    parent: null,
    priority: 'high',
    state: 'todo',
    subIssueCount: 2,
    taskIds: [],
    title: 'Rotate the signing key',
    updatedAt: '2026-11-26T10:00:00.000Z',
    version: 3,
};

function issueHarness(respond: Parameters<typeof harness>[0]) {
    const stub = harness(respond);
    return {
        ...stub,
        exec: (
            action: (parsed: ParsedArgs, deps: IssueDeps) => Promise<number>,
            parsed: ParsedArgs
        ) => stub.run((input, deps) => action(input, { ...deps, stdinIsTty: false }), parsed),
    };
}

describe('haus issue', () => {
    test('create files the stdin description in the caller Project', async () => {
        const stub = issueHarness(() => ({ issue }));
        await stub.exec(
            runIssueCreate,
            args({
                values: {
                    '--assignee': 'kit',
                    '--priority': 'high',
                    '--title': 'Rotate the signing key',
                },
            })
        );
        expect(stub.calls).toEqual([
            {
                input: {
                    body: {
                        assignee: '@kit',
                        description: 'From stdin',
                        priority: 'high',
                        title: 'Rotate the signing key',
                    },
                    method: 'POST',
                },
                route: '/api/agent/issues/create',
            },
        ]);
        expect(stub.lines.join('')).toBe(
            'Created GEN-12 [todo] "Rotate the signing key" · priority high · assigned @orbit · labels Security · 1/2 sub-issues closed\n'
        );
    });

    test('update claims with --expect-assignee none, sent as null', async () => {
        const stub = issueHarness(() => ({ issue }));
        await stub.exec(
            runIssueUpdate,
            args({
                positionals: ['GEN-12'],
                values: { '--assignee': 'me', '--expect-assignee': 'none', '--due': 'none' },
            })
        );
        expect(stub.calls[0]?.input?.body).toEqual({
            assignee: 'me',
            code: 'GEN-12',
            dueOn: null,
            expectAssignee: null,
            expectedVersion: undefined,
        });
    });

    test('list defaults to open Issues assigned to the caller', async () => {
        const stub = issueHarness(() => ({ issues: [issue], omitted: 2 }));
        await stub.exec(runIssueList, args());
        expect(stub.calls[0]?.input).toEqual({
            method: 'GET',
            query: {
                assignee: 'me',
                parent: undefined,
                project: undefined,
                query: undefined,
                state: undefined,
            },
        });
        expect(stub.lines.join('')).toContain('3 Issues assigned to you, by priority then age:');
        expect(stub.lines.join('')).toContain('Truncated: 2 more.');
    });

    test('show prints comments and activity', async () => {
        const stub = issueHarness(() => ({
            activity: [
                {
                    actor: { handle: 'ada', kind: 'user' },
                    createdAt: '2026-11-26T09:30:00.000Z',
                    from: 'todo',
                    kind: 'state_changed',
                    to: 'in_progress',
                },
            ],
            comments: [
                {
                    author: { handle: 'orbit', kind: 'captain' },
                    body: 'On it.',
                    createdAt: '2026-11-26T09:40:00.000Z',
                    id: 'icm_1',
                    parentCommentId: null,
                    replyToCommentId: null,
                },
            ],
            description: 'Rotate it before Friday.',
            issue,
            pullRequests: [],
            subIssues: [],
        }));
        await stub.exec(runIssueShow, args({ positionals: ['GEN-12'] }));
        const text = stub.lines.join('');
        expect(text).toContain('Description:\nRotate it before Friday.');
        expect(text).toContain('@orbit: On it.');
        expect(text).toContain('@ada state changed: todo → in_progress');
    });

    test('a comment needs a body and an Issue code', async () => {
        const stub = issueHarness(() => ({}));
        await expect(stub.exec(runIssueComment, args({ positionals: ['gen-12'] }))).rejects.toThrow(
            'GEN-12'
        );
    });
});
