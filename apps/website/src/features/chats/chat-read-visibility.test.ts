import { expect, test } from 'bun:test';
import { getHighestVisibleSequence } from './chat-read-visibility.ts';

test('only visible transcript entries contribute to the read sequence', () => {
    const loadedSequences = new Map([
        ['message-old', 2],
        ['message-new', 9],
    ]);

    expect(getHighestVisibleSequence(['message-old'], loadedSequences)).toBe(2);
    expect(getHighestVisibleSequence(['message-new', 'message-old'], loadedSequences)).toBe(9);
    expect(getHighestVisibleSequence(['message-not-rendered'], loadedSequences)).toBeUndefined();
});
