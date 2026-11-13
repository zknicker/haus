import { expect, test } from 'bun:test';
import type { MessageClaim } from '@haus/api';
import { threadWorkClaim } from './thread-work-claim.ts';

const anchorClaim = { number: 1 } as MessageClaim;
const replyClaim = { number: 2 } as MessageClaim;

test('a Thread opened on its anchor’s claim states that claim', () => {
    expect(threadWorkClaim({ id: 'msg_anchor', claim: anchorClaim }, null)).toEqual({
        messageId: 'msg_anchor',
        claim: anchorClaim,
    });
});

test('a Thread opened on a reply’s claim states the reply’s claim, not the anchor’s', () => {
    expect(
        threadWorkClaim(
            { id: 'msg_anchor', claim: anchorClaim },
            { id: 'msg_reply', claim: replyClaim }
        )
    ).toEqual({ messageId: 'msg_reply', claim: replyClaim });
});

test('a plain Thread states no claim', () => {
    expect(threadWorkClaim({ id: 'msg_anchor', claim: null }, undefined)).toBeNull();
});
