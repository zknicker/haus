import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompositionEvent } from '@haus/api';
import { visibleCompositions } from './visible-compositions.ts';

function composition(actorUserId: string): CompositionEvent {
    return {
        actorUserId,
        chatId: 'cht_all',
        compositionId: `cmp_${actorUserId}`,
        emittedAt: '2026-07-26T12:00:00.000Z',
        serverId: 'srv_main',
        text: 'typing…',
    };
}

test('compositions from current members are shown', () => {
    const events = [composition('usr_one'), composition('usr_two')];

    assert.deepEqual(
        visibleCompositions(events, ['usr_one', 'usr_two']).map((event) => event.actorUserId),
        ['usr_one', 'usr_two']
    );
});

test('a human who is no longer a member stops appearing as typing', () => {
    const events = [composition('usr_one'), composition('usr_removed')];

    assert.deepEqual(
        visibleCompositions(events, ['usr_one']).map((event) => event.actorUserId),
        ['usr_one']
    );
});

test('an unknown member list hides nothing it cannot yet judge', () => {
    const events = [composition('usr_one')];

    assert.equal(visibleCompositions(events, undefined).length, 1);
});
