import { expect, test } from 'bun:test';
import { type MessageClaim, messageClaimAssigneeLabel } from './claim-presentation.ts';

test('labels known claim owners without guessing a handle-less actor kind', () => {
    expect(messageClaimAssigneeLabel(claim({ handle: 'otto', id: 'agent_otto' }))).toBe('@otto');
    expect(messageClaimAssigneeLabel(claim({ handle: null, id: 'agent_missing' }))).toBeNull();
});

function claim(assignee: NonNullable<MessageClaim['assignee']>): MessageClaim {
    return { assignee, live: false, number: 1, status: 'todo', tier: 'tracked' };
}
