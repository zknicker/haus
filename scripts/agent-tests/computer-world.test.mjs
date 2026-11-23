import { describe, expect, test } from 'bun:test';
import { newComputerId, summarizeInvocations, turnRunIds } from './computer-world.mjs';

const home = 'cmp_homehomehomehome';
const macbook = { id: 'cmp_macbookmacbookm', name: 'MacBook' };

function row(overrides) {
    return {
        computerId: home,
        kind: 'bash',
        outcome: 'succeeded',
        refusal: null,
        runId: 'run_1',
        state: 'finished',
        ...overrides,
    };
}

describe('summarizeInvocations', () => {
    test('counts only the turn runs and keeps home calls off the away list', () => {
        const calls = summarizeInvocations(
            [row({}), row({ computerId: macbook.id, runId: 'run_0' })],
            { homeId: home, runIds: ['run_1'] }
        );
        expect(calls.total).toBe(1);
        expect(calls.away).toEqual([]);
        expect(calls.refused).toEqual([]);
        expect(calls.lines).toEqual(['bash on home: succeeded']);
    });

    test('names the target, and lists calls that left home or were refused', () => {
        const calls = summarizeInvocations(
            [
                row({
                    computerId: macbook.id,
                    kind: 'desktop',
                    outcome: 'offline',
                    refusal: 'offline',
                }),
                row({ computerId: null, outcome: 'failed', refusal: 'not-found' }),
                row({ outcome: null, state: 'sent' }),
            ],
            { homeId: home, runIds: ['run_1'], target: macbook }
        );
        expect(calls.onTarget).toEqual(['desktop on MacBook: offline, refused offline']);
        expect(calls.away).toEqual([
            'desktop on MacBook: offline, refused offline',
            'bash on no Computer: failed, refused not-found',
        ]);
        expect(calls.refused).toHaveLength(2);
        expect(calls.lines.at(-1)).toBe('bash on home: sent');
        expect(calls.desktopOnHome).toEqual([]);
    });

    test('flags a desktop call that went to the home Computer', () => {
        const calls = summarizeInvocations(
            [row({ kind: 'desktop', outcome: 'failed', refusal: 'off' })],
            { homeId: home, runIds: ['run_1'], target: macbook }
        );
        expect(calls.desktopOnHome).toEqual(['desktop on home: failed, refused off']);
        expect(calls.onTarget).toEqual([]);
    });
});

test('turnRunIds prefers every run the observer saw', () => {
    expect(turnRunIds({ runId: 'run_2', runIds: ['run_1', 'run_2'] })).toEqual(['run_1', 'run_2']);
    expect(turnRunIds({ runId: 'run_2' })).toEqual(['run_2']);
});

test('newComputerId fits the computers id check', () => {
    expect(newComputerId()).toMatch(/^cmp_[A-Za-z0-9_-]{16}$/u);
});
