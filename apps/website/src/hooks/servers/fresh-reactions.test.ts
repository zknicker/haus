import { describe, expect, test } from 'bun:test';
import {
    createFreshReactionLedger,
    liveEventMaxAgeMs,
    liveWindowMs,
    reactionKey,
} from './fresh-reactions.ts';

const heart = reactionKey('💛', 'agent-tiny');
const party = reactionKey('🎉', 'agent-blippy');
const own = reactionKey('👍', 'user-zach');

describe('fresh reaction ledger', () => {
    test('history never stamps: the first sighting only sets a baseline', () => {
        const ledger = createFreshReactionLedger();
        ledger.noteLive('m1', 1000, 1000);

        expect(ledger.observe('m1', [heart, party], 1000)).toEqual([]);
    });

    test('a reaction added after a live event stamps', () => {
        const ledger = createFreshReactionLedger();
        ledger.observe('m1', [heart], 0);
        ledger.noteLive('m1', 1000, 1000);

        expect(ledger.observe('m1', [heart, party], 1200)).toEqual([party]);
        // Observed once; a re-render with the same data does not replay it.
        expect(ledger.observe('m1', [heart, party], 1300)).toEqual([]);
    });

    test('a second reactor on the same emoji stamps only their own sticker', () => {
        const ledger = createFreshReactionLedger();
        const tinyThumb = reactionKey('👍', 'agent-tiny');
        const blippyThumb = reactionKey('👍', 'agent-blippy');
        ledger.observe('m1', [tinyThumb], 0);
        ledger.noteLive('m1', 100, 100);

        expect(ledger.observe('m1', [tinyThumb, blippyThumb], 200)).toEqual([blippyThumb]);
    });

    test('a change without a live event (reload, snapshot refetch) renders at rest', () => {
        const ledger = createFreshReactionLedger();
        ledger.observe('m1', [heart], 0);

        expect(ledger.observe('m1', [heart, party], 500)).toEqual([]);
    });

    test('a catch-up replay of an old event is history', () => {
        const ledger = createFreshReactionLedger();
        ledger.observe('m1', [], 0);
        ledger.noteLive('m1', 0, liveEventMaxAgeMs + 1);

        expect(ledger.observe('m1', [party], liveEventMaxAgeMs + 2)).toEqual([]);
    });

    test('the live window closes', () => {
        const ledger = createFreshReactionLedger();
        ledger.observe('m1', [], 0);
        ledger.noteLive('m1', 0, 0);

        expect(ledger.observe('m1', [party], liveWindowMs + 1)).toEqual([]);
    });

    test('live marks stay on their own message', () => {
        const ledger = createFreshReactionLedger();
        ledger.observe('m1', [], 0);
        ledger.observe('m2', [], 0);
        ledger.noteLive('m1', 0, 0);

        expect(ledger.observe('m2', [party], 10)).toEqual([]);
    });

    test('the viewer’s pending add stamps once, and its confirmation does not replay it', () => {
        const ledger = createFreshReactionLedger();
        ledger.observe('m1', [heart], 0);
        ledger.addPending('m1', '👍', 100);

        expect(ledger.pending('m1')).toEqual(['👍']);
        expect(ledger.observe('m1', [heart, own], 100)).toEqual([own]);

        ledger.noteLive('m1', 300, 300);
        ledger.dropPending('m1', '👍');
        expect(ledger.observe('m1', [heart, own], 350)).toEqual([]);
        expect(ledger.pending('m1')).toEqual([]);
    });

    test('pending snapshots keep identity until the set changes, and notify', () => {
        const ledger = createFreshReactionLedger();
        let notified = 0;
        const unsubscribe = ledger.subscribe(() => {
            notified += 1;
        });
        ledger.addPending('m1', '👍', 0);
        const first = ledger.pending('m1');

        expect(ledger.pending('m1')).toBe(first);
        ledger.dropPending('m1', '🎉');
        expect(notified).toBe(1);
        ledger.dropPending('m1', '👍');
        expect(notified).toBe(2);
        unsubscribe();
    });
});
