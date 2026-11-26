import { describe, expect, test } from 'bun:test';
import { type Issue, type IssueActor, type IssueState, issueStateType } from '@haus/api';
import {
    deriveIssueComment,
    deriveIssueWrite,
    deriveSubIssuesClosed,
} from '../src/issues/issue-wakes.ts';

const captain: IssueActor = { agentId: 'agt_captain', kind: 'captain' };
const otherCaptain: IssueActor = { agentId: 'agt_other', kind: 'captain' };
const task: IssueActor = { kind: 'task', taskId: 'tsk_crew' };
const person: IssueActor = { kind: 'user', userId: 'usr_ada' };

function issue(state: IssueState, assignee: IssueActor | null, version = 2) {
    const record: Issue = {
        assignee,
        closedAt: issueStateType(state) === 'closed' ? '2026-11-26T10:00:00.000Z' : null,
        closedSubIssueCount: 0,
        code: 'GEN-12',
        createdAt: '2026-11-26T09:00:00.000Z',
        creator: person,
        description: '',
        dueOn: null,
        id: 'iss_12',
        labelIds: [],
        number: 12,
        parentId: null,
        priority: 'normal',
        projectId: 'cht_gen',
        serverId: 'srv_1',
        state: { id: state, type: issueStateType(state) },
        subIssueCount: 0,
        taskIds: [],
        title: 'Rotate the signing key',
        updatedAt: '2026-11-26T09:30:00.000Z',
        version,
    };
    return record;
}

const stateEvent = {
    change: { from: 'todo', kind: 'state_changed', to: 'in_progress' } as const,
    id: 'iev_state',
    issueId: 'iss_12',
};

describe('the woken agent follows the assignee', () => {
    test.each([
        ['a Captain wakes that Captain', captain, [{ agentId: 'agt_captain', kind: 'captain' }]],
        ['a Task wakes that Task', task, [{ kind: 'task', taskId: 'tsk_crew' }]],
        ['a person wakes no agent', person, []],
        ['nobody wakes nobody', null, []],
    ] as const)('%s', (_name, assignee, recipients) => {
        const wakes = deriveIssueWrite({
            actor: otherCaptain,
            after: issue('todo', assignee),
            before: issue('todo', null, 1),
            events: [],
        });
        expect(wakes.map((wake) => wake.recipient)).toEqual([...recipients]);
        expect(wakes.every((wake) => wake.identity === 'issue-assign:iss_12:2')).toBe(true);
    });

    test('the actor never wakes itself', () => {
        expect(
            deriveIssueWrite({
                actor: captain,
                after: issue('todo', captain),
                before: issue('todo', null, 1),
                events: [],
            })
        ).toEqual([]);
        expect(
            deriveIssueComment({ actor: task, commentId: 'icm_1', issue: issue('todo', task) })
        ).toEqual([]);
    });

    test('assigning in Backlog wakes nobody, and leaving Backlog wakes as an assignment', () => {
        expect(
            deriveIssueWrite({
                actor: person,
                after: issue('backlog', captain),
                before: issue('backlog', null, 1),
                events: [],
            })
        ).toEqual([]);
        expect(
            deriveIssueWrite({
                actor: person,
                after: issue('todo', captain, 3),
                before: issue('backlog', captain),
                events: [
                    {
                        ...stateEvent,
                        change: { from: 'backlog', kind: 'state_changed', to: 'todo' },
                    },
                ],
            })
        ).toEqual([
            {
                identity: 'issue-assign:iss_12:3',
                issueId: 'iss_12',
                kind: 'issue_assignment',
                recipient: { agentId: 'agt_captain', kind: 'captain' },
            },
        ]);
    });

    test('assigning a closed Issue wakes nobody', () => {
        expect(
            deriveIssueWrite({
                actor: person,
                after: issue('done', captain),
                before: issue('done', null, 1),
                events: [],
            })
        ).toEqual([]);
    });

    test('a state change and a comment by someone else wake as issue events', () => {
        expect(
            deriveIssueWrite({
                actor: person,
                after: issue('in_progress', captain, 3),
                before: issue('todo', captain),
                events: [stateEvent],
            })
        ).toEqual([
            {
                identity: 'issue-event:iss_12:iev_state',
                issueId: 'iss_12',
                kind: 'issue_event',
                recipient: { agentId: 'agt_captain', kind: 'captain' },
            },
        ]);
        expect(
            deriveIssueComment({ actor: person, commentId: 'icm_1', issue: issue('todo', task) })
        ).toEqual([
            {
                identity: 'issue-event:iss_12:icm_1',
                issueId: 'iss_12',
                kind: 'issue_event',
                recipient: { kind: 'task', taskId: 'tsk_crew' },
            },
        ]);
    });

    test('title, priority and label edits wake nobody', () => {
        expect(
            deriveIssueWrite({
                actor: person,
                after: issue('todo', captain, 3),
                before: issue('todo', captain),
                events: [
                    {
                        change: { from: 'normal', kind: 'priority_changed', to: 'urgent' },
                        id: 'iev_priority',
                        issueId: 'iss_12',
                    },
                ],
            })
        ).toEqual([]);
    });

    test("the parent's agent wakes once its last open sub-issue closes", () => {
        const parent = {
            ...issue('in_progress', captain),
            closedSubIssueCount: 2,
            subIssueCount: 2,
        };
        expect(deriveSubIssuesClosed({ actor: person, eventId: 'iev_child', parent })).toEqual([
            {
                identity: 'issue-event:iss_12:iev_child',
                issueId: 'iss_12',
                kind: 'issue_event',
                recipient: { agentId: 'agt_captain', kind: 'captain' },
            },
        ]);
        expect(
            deriveSubIssuesClosed({
                actor: person,
                eventId: 'iev_child',
                parent: { ...parent, closedSubIssueCount: 1 },
            })
        ).toEqual([]);
    });
});
