import { expect, test } from 'bun:test';
import { orderChannelIds, readChannelOrder, writeChannelOrder } from './channel-order.ts';

test('restores known channels and appends newly visible channels', () => {
    expect(orderChannelIds(['one', 'two', 'three'], ['two', 'archived', 'one'])).toEqual([
        'two',
        'one',
        'three',
    ]);
});

test('reads only unique string ids from stored presentation state', () => {
    const storage = { getItem: () => JSON.stringify(['two', 1, 'two', 'one']) };

    expect(readChannelOrder(storage, 'channels')).toEqual(['two', 'one']);
    expect(readChannelOrder({ getItem: () => '{' }, 'channels')).toEqual([]);
});

test('writes the complete visible order', () => {
    let stored = '';
    writeChannelOrder({ setItem: (_key, value) => (stored = value) }, 'channels', ['two', 'one']);

    expect(stored).toBe('["two","one"]');
});
