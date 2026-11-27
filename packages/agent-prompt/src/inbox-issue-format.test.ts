import { expect, test } from 'bun:test';
import type { AgentIssueAssignment } from '@haus/api';
import { composeInboxNotice } from './inbox-format.ts';
import { composeIssueAssignmentInput, composeIssueEventInput } from './inbox-issue-format.ts';

const assignment: AgentIssueAssignment = {
    by: '@ada',
    byAgent: false,
    code: 'GEN-12',
    id: 'issue-assign:iss_12:2',
    issueId: 'iss_12',
    priority: 'high',
    state: 'todo',
    title: 'Rotate the\n deploy key',
};

test("a Captain's assignment run also names crew as the way to work an Issue", () => {
    expect(composeIssueAssignmentInput([assignment], 'captain').split('\n').at(-1)).toBe(
        '`haus issue show <code>` prints an Issue with its comments, and `haus issue list` is your whole queue, by priority then age. An Issue moves only when someone edits it: `haus issue update <code> --state in_progress`. An Issue that takes longer than a reply is crew work: `haus task start --issue <code> --title <text> < brief` starts a Task that holds it.'
    );
});

test('an assignment run lists each Issue and teaches the queue once', () => {
    expect(
        composeIssueAssignmentInput(
            [assignment, { ...assignment, by: null, code: 'GEN-9' }],
            'task'
        )
    ).toBe(
        [
            '2 Issues assigned to you:',
            '[Haus issue assignment GEN-12 priority=high state=todo by=@ada] Rotate the deploy key',
            '[Haus issue assignment GEN-9 priority=high state=todo] Rotate the deploy key',
            '',
            '`haus issue show <code>` prints an Issue with its comments, and `haus issue list` is your whole queue, by priority then age. An Issue moves only when someone edits it: `haus issue update <code> --state in_progress`.',
        ].join('\n')
    );
});

test('an event run quotes a comment and names state changes and closed sub-issues', () => {
    const { priority: _priority, state: _state, ...base } = assignment;
    expect(
        composeIssueEventInput([
            {
                ...base,
                change: {
                    body: 'Is the old\nkey revoked?',
                    commentId: 'icm_1',
                    kind: 'commented',
                    truncated: true,
                },
                id: 'issue-event:iss_12:icm_1',
            },
            {
                ...base,
                by: 'task:k3mq7xta',
                byAgent: true,
                change: { from: 'todo', kind: 'state_changed', to: 'done' },
                id: 'issue-event:iss_12:iev_1',
            },
            {
                ...base,
                change: { kind: 'sub_issues_closed', total: 3 },
                id: 'issue-event:iss_12:iev_2',
            },
        ])
    ).toBe(
        [
            '3 updates on Issues assigned to you:',
            '[Haus issue comment GEN-12 commentId=icm_1 by=@ada] Rotate the deploy key',
            '> Is the old key revoked? …',
            '[Haus issue state GEN-12 todo→done by=task:k3mq7xta] Rotate the deploy key',
            '[Haus issue sub-issues closed GEN-12 total=3 by=@ada] Rotate the deploy key',
            '',
            '`haus issue show <code>` prints the whole Issue, and `haus issue comment <code> --reply-to <commentId>` answers a comment on it.',
        ].join('\n')
    );
});

test('a busy notice counts Issue items without their content', () => {
    expect(
        composeInboxNotice([], 0, { issueItems: { ids: ['issue-assign:iss_12:2'], total: 3 } })
    ).toBe(
        [
            '[Haus inbox notice:',
            '3 Issue updates for you',
            ']',
            'Their details arrive in your next turn. Keep working; the notice is not itself a request, so do not acknowledge it.',
        ].join('\n')
    );
});
