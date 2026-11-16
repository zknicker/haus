import { expect, test } from 'bun:test';
import { claimThreadTarget, isThreadClaim } from './claim-thread-target.ts';

test('a top-level claim opens the Thread anchored on its own message', () => {
    const source = {
        message: { chatId: 'cht_dm', id: 'msg_claim' },
        claim: { chatId: 'cht_dm', threadChatId: 'cht_thr_claim' },
        threadSummary: { anchorMessageId: 'msg_claim' },
    };

    expect(isThreadClaim(source)).toBe(false);
    expect(claimThreadTarget(source)).toEqual({
        anchorMessageId: 'msg_claim',
        kind: 'anchor',
        threadChatId: 'cht_thr_claim',
    });
});

test('a Thread claim opens the Thread it sits in, anchored on that Thread’s anchor', () => {
    const source = {
        message: { chatId: 'cht_thr_anchor', id: 'msg_reply' },
        claim: { chatId: 'cht_dm', threadChatId: 'cht_thr_anchor' },
        threadSummary: { anchorMessageId: 'msg_anchor' },
    };

    expect(isThreadClaim(source)).toBe(true);
    expect(claimThreadTarget(source)).toEqual({
        anchorMessageId: 'msg_anchor',
        kind: 'in-thread',
        claimMessageId: 'msg_reply',
        threadChatId: 'cht_thr_anchor',
    });
});

test('a Thread claim never anchors a Thread on its own message', () => {
    // A summary keyed on the claim message itself names no containing Thread;
    // opening it as an anchor would reply to an in-Thread message and nest.
    expect(
        claimThreadTarget({
            message: { chatId: 'cht_thr_anchor', id: 'msg_reply' },
            claim: { chatId: 'cht_dm', threadChatId: 'cht_thr_anchor' },
            threadSummary: { anchorMessageId: 'msg_reply' },
        })
    ).toBeNull();
});
