import { expect, test } from 'bun:test';
import { streamWeeklyTurn } from '../apps/computer/src/harness/cove-weekly-turn.mjs';

async function observe(events) {
    const turn = { actions: [], label: 'synthetic-validation' };
    return streamWeeklyTurn({
        session: {
            startTurn: async () => ({
                events: (async function* () {
                    yield* events;
                })(),
            }),
        },
        turn,
        notes: '/nonexistent-synthetic-fixture-notes',
        persistEvidence: async () => {},
        prompt: 'Synthetic.',
    });
}

const finished = { claudePlanUsage: null, type: 'turn-finish', usage: null };

test('native model failures and aborts never count as quiet success', async () => {
    await expect(observe([{ type: 'error', error: 'Synthetic capacity failure' }])).rejects.toThrow(
        'Synthetic capacity failure'
    );
    await expect(observe([{ type: 'abort' }])).rejects.toThrow('aborted');
    await expect(observe([])).rejects.toThrow('without a finish receipt');
    await expect(observe([{ type: 'error', error: 'late failure' }, finished])).rejects.toThrow(
        'late failure'
    );
});

test('a completed silent native turn needs a finish receipt', async () => {
    const turn = await observe([finished]);
    expect(turn.finalText).toBe('');
    expect(turn.messages).toEqual([]);
});
