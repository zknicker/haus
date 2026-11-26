import { expect, test } from 'bun:test';
import type { Issue, IssueState } from '@haus/api';
import { issueStateRef } from './issue-state.ts';
import {
    filterIssues,
    groupIssuesByState,
    issueBoardColumns,
    issueListInput,
    readIssuesPageFilters,
} from './issues-page-model.ts';

const viewer = 'usr_ada';
const read = (query: string) => readIssuesPageFilters(new URLSearchParams(query));
const issue = (id: string, state: IssueState, labelIds: string[] = []) =>
    ({ id, labelIds, state: issueStateRef(state) }) as unknown as Issue;

test('each tab reads as its own issue.list lens', () => {
    expect(issueListInput(read(''), viewer)).toEqual({ reader: 'subscribed' });
    expect(issueListInput(read('view=assigned'), viewer)).toEqual({
        assignee: { kind: 'user', userId: viewer },
    });
    expect(issueListInput(read('view=created'), viewer)).toEqual({
        creator: { kind: 'user', userId: viewer },
    });
    expect(issueListInput(read('view=mentioned'), viewer)).toEqual({ reader: 'mentioned' });
    expect(issueListInput(read('view=all'), viewer)).toEqual({});
    expect(read('view=bogus&layout=grid').view).toBe('for-you');
    expect(read('layout=board').layout).toBe('board');
});

test('Project and assignee filters narrow the read, and the Assigned tab ignores an assignee', () => {
    expect(issueListInput(read('view=all&project=cht_eng&assignee=none'), viewer)).toEqual({
        assignee: 'none',
        projectId: 'cht_eng',
    });
    expect(issueListInput(read('view=all&assignee=captain:agt_orbit'), viewer)).toEqual({
        assignee: { agentId: 'agt_orbit', kind: 'captain' },
    });
    expect(issueListInput(read('view=assigned&assignee=none'), viewer)).toEqual({
        assignee: { kind: 'user', userId: viewer },
    });
});

test('the list groups by state with work in progress first, and the board keeps every column', () => {
    const issues = [issue('a', 'done'), issue('b', 'in_progress', ['lbl_ui']), issue('c', 'todo')];
    expect(groupIssuesByState(issues).map((group) => group.state)).toEqual([
        'in_progress',
        'todo',
        'done',
    ]);
    expect(issueBoardColumns(issues).map((column) => [column.state, column.issues.length])).toEqual(
        [
            ['backlog', 0],
            ['todo', 1],
            ['in_progress', 1],
            ['done', 1],
            ['canceled', 0],
        ]
    );
    expect(filterIssues(issues, { label: 'lbl_ui' }).map((entry) => entry.id)).toEqual(['b']);
});
