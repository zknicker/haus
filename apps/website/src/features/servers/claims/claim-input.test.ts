import { expect, test } from 'bun:test';
import { claimAssignmentInput, claimUpdateInput, toggledTaskLabelIds } from './claim-input.ts';

test('keeps expectedVersion on assignment and metadata writes', () => {
    const claim = { id: 'message_one', version: 7 };

    expect(claimAssignmentInput('server_one', claim, { agentId: 'agt_one' })).toEqual({
        assignee: { agentId: 'agt_one' },
        expectedVersion: 7,
        messageId: 'message_one',
        serverId: 'server_one',
    });
    expect(claimAssignmentInput('server_one', claim, null)).toMatchObject({ assignee: null });
    expect(claimUpdateInput('server_one', claim, { priority: 'urgent' })).toEqual({
        expectedVersion: 7,
        messageId: 'message_one',
        patch: { priority: 'urgent' },
        serverId: 'server_one',
    });
});

test('toggles task labels without duplicates and preserves catalog order', () => {
    expect(toggledTaskLabelIds(['label_one'], 'label_two', true)).toEqual([
        'label_one',
        'label_two',
    ]);
    expect(toggledTaskLabelIds(['label_one', 'label_two'], 'label_one', false)).toEqual([
        'label_two',
    ]);
});
