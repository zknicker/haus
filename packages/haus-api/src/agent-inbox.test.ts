import { expect, test } from 'bun:test';
import { agentInboxItemSchema } from './agent-inbox.ts';

const item = {
    chatId: 'cht_general',
    content: 'Move standup to 9?',
    createdAt: '2026-10-08T14:03:27.000Z',
    id: 'msg_1a2b3c4d',
    senderHandle: 'sam',
    senderType: 'human',
    sequence: 4,
    target: '#general',
};

test("a human envelope carries the sender's canonical IANA zone", () => {
    const parsed = agentInboxItemSchema.parse({ ...item, senderTimezone: 'america/chicago' });
    expect(parsed.senderTimezone).toBe('America/Chicago');
    expect(agentInboxItemSchema.parse(item).senderTimezone).toBeUndefined();
});

test('a zone is refused on a non-human envelope and as an offset', () => {
    for (const senderType of ['agent', 'system', 'trigger']) {
        expect(
            agentInboxItemSchema.safeParse({ ...item, senderTimezone: 'UTC', senderType }).success
        ).toBe(false);
    }
    expect(agentInboxItemSchema.safeParse({ ...item, senderTimezone: '+05:00' }).success).toBe(
        false
    );
});
