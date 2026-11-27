import { expect, test } from 'bun:test';
import { type Issue, type IssueState, issueStateType } from '@haus/api';
import {
    crewRowTitle,
    issueCodeByTask,
    issueGroupStartsOpen,
    issueGroups,
    issuesWaitingOnPeople,
} from './captain-model.ts';

test('Needs you lists the open Issues a Captain filed that wait on a person', () => {
    const waiting = issuesWaitingOnPeople([
        issue({ assignee: { kind: 'user', userId: 'usr_zach' }, number: 18 }),
        issue({ assignee: { kind: 'user', userId: 'usr_zach' }, number: 19, state: 'done' }),
        issue({ assignee: { agentId: 'agt_juniper', kind: 'captain' }, number: 20 }),
        issue({ assignee: null, number: 21 }),
    ]);
    expect(waiting.map(({ code }) => code)).toEqual(['GEN-18']);
});

test('a crew row reads "GEN-12 · title" only when an Issue links the Task', () => {
    const codes = issueCodeByTask([
        issue({ number: 12, taskIds: ['tsk_fixed_bid'] }),
        issue({ number: 13, taskIds: [] }),
    ]);
    expect(crewRowTitle('Fixed-bid switch', codes.get('tsk_fixed_bid'))).toBe(
        'GEN-12 · Fixed-bid switch'
    );
    expect(crewRowTitle('Pull royalty totals', codes.get('tsk_royalty'))).toBe(
        'Pull royalty totals'
    );
});

test('the Issues tab groups by state in order, drops empty groups, and collapses closed ones', () => {
    const groups = issueGroups([
        issue({ number: 1, state: 'backlog' }),
        issue({ number: 2, state: 'done' }),
        issue({ number: 3, state: 'in_progress', updatedAt: '2026-11-26T10:00:00.000Z' }),
        issue({ number: 4, state: 'in_progress', updatedAt: '2026-11-26T12:00:00.000Z' }),
    ]);
    expect(groups.map(({ state }) => state)).toEqual(['in_progress', 'backlog', 'done']);
    expect(groups[0]?.issues.map(({ code }) => code)).toEqual(['GEN-4', 'GEN-3']);
    expect(groups.map(({ state }) => issueGroupStartsOpen(state))).toEqual([true, true, false]);
});

function issue(overrides: {
    assignee?: Issue['assignee'];
    number: number;
    state?: IssueState;
    taskIds?: string[];
    updatedAt?: string;
}) {
    const state = overrides.state ?? 'todo';
    const closed = issueStateType(state) === 'closed';
    return {
        assignee: overrides.assignee ?? null,
        closedAt: closed ? '2026-11-26T09:00:00.000Z' : null,
        closedSubIssueCount: 0,
        code: `GEN-${overrides.number}`,
        createdAt: '2026-11-25T09:00:00.000Z',
        creator: { agentId: 'agt_juniper', kind: 'captain' },
        description: '',
        dueOn: null,
        id: `iss_${overrides.number}`,
        labelIds: [],
        number: overrides.number,
        parentId: null,
        priority: 'normal',
        projectId: 'chat_gen',
        serverId: 'srv_haus',
        state: { id: state, type: closed ? 'closed' : 'open' },
        subIssueCount: 0,
        taskIds: overrides.taskIds ?? [],
        title: `Issue ${overrides.number}`,
        updatedAt: overrides.updatedAt ?? '2026-11-26T09:00:00.000Z',
        version: 1,
    } satisfies Issue;
}
