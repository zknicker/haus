import { describe, expect, test } from 'bun:test';
import { emitTurn, flush, runningFakeTurn, turnCompleted } from './testing/session-harness.ts';

const userMessage = (text: string) => ({
    item: {
        content: [{ text, text_elements: [], type: 'text' }],
        id: `user-${text}`,
        type: 'userMessage',
    },
});

describe('Codex steers that never reach the model', () => {
    test('a delivered steer Stop interrupts before Codex records it is returned', async () => {
        const { fake, session, turn } = await runningFakeTurn();
        expect(await session.steer('inbox notice')).toEqual({ delivered: true });
        turn.abort.abort();
        await flush();
        turnCompleted(fake, turn.turnId, 'interrupted');
        await turn.finished;
        expect(turn.unconsumedSteers()).toEqual(['inbox notice']);
    });

    test('a steer Codex recorded as a user message reached the model', async () => {
        const { fake, session, turn } = await runningFakeTurn();
        expect(await session.steer('inbox notice')).toEqual({ delivered: true });
        emitTurn(fake, turn.turnId, 'item/started', userMessage('inbox notice'));
        await flush();
        turnCompleted(fake, turn.turnId);
        await turn.finished;
        expect(turn.unconsumedSteers()).toEqual([]);
    });
});
