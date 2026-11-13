import { expect, test } from 'bun:test';
import { claimAssignmentInput, claimUpdateInput } from './claim-input.ts';

test('keeps expectedVersion on assignment and status writes', () => {
    const claim = { id: 'message_one', version: 7 };

    expect(claimAssignmentInput('server_one', claim, { agentId: 'agt_one' })).toEqual({
        assignee: { agentId: 'agt_one' },
        expectedVersion: 7,
        messageId: 'message_one',
        serverId: 'server_one',
    });
    expect(claimAssignmentInput('server_one', claim, null)).toMatchObject({ assignee: null });
    expect(claimUpdateInput('server_one', claim, { status: 'done' })).toEqual({
        expectedVersion: 7,
        messageId: 'message_one',
        patch: { status: 'done' },
        serverId: 'server_one',
    });
});
