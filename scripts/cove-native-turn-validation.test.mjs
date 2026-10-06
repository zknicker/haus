import { expect, test } from 'bun:test';
import { streamWeeklyTurn } from '../apps/computer/src/harness/cove-weekly-turn.mjs';

async function observe(parts) {
    const turn = { actions: [], label: 'synthetic-validation' };
    return streamWeeklyTurn({
        agent: {
            stream: async () => ({
                fullStream: (async function* () {
                    yield* parts;
                })(),
                text: Promise.resolve(''),
            }),
        },
        session: {},
        turn,
        notes: '/nonexistent-synthetic-fixture-notes',
        persistEvidence: async () => {},
        prompt: 'Synthetic.',
    });
}

test('native model failures and aborts never count as quiet success', async () => {
    await expect(observe([{ type: 'error', error: 'Synthetic capacity failure' }])).rejects.toThrow(
        'Synthetic capacity failure'
    );
    await expect(observe([{ type: 'abort' }])).rejects.toThrow('aborted');
    await expect(observe([])).rejects.toThrow('without a finish receipt');
    await expect(observe([{ type: 'finish', finishReason: { unified: 'error' } }])).rejects.toThrow(
        'finished with an error'
    );
});

test('a completed silent native turn needs a finish receipt', async () => {
    const turn = await observe([{ type: 'finish', finishReason: { unified: 'stop' } }]);
    expect(turn.finishReason.unified).toBe('stop');
    expect(turn.messages).toEqual([]);
});
