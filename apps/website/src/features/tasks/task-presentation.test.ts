import { expect, test } from 'bun:test';
import { type MessageTask, messageTaskAssigneeLabel } from './task-presentation.ts';

test('labels known task owners without guessing a handle-less actor kind', () => {
    expect(messageTaskAssigneeLabel(task({ handle: 'otto', id: 'agent_otto' }))).toBe('@otto');
    expect(messageTaskAssigneeLabel(task({ handle: null, id: 'agent_missing' }))).toBeNull();
});

function task(assignee: NonNullable<MessageTask['assignee']>): MessageTask {
    return { assignee, live: false, number: 1, status: 'todo', tier: 'tracked' };
}
