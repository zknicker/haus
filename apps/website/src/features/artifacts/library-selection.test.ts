import { expect, test } from 'bun:test';
import { isDoubleClickEcho } from './library-selection.ts';

const open = { at: 1000, x: 200, y: 120 };

test('the second press of a double click at the same spot is an echo of the open', () => {
    expect(isDoubleClickEcho(open, { at: 1250, x: 201, y: 121 })).toBe(true);
});

test('a quick click on another item still opens it', () => {
    expect(isDoubleClickEcho(open, { at: 1250, x: 200, y: 180 })).toBe(false);
});

test('a later click at the same spot opens again', () => {
    expect(isDoubleClickEcho(open, { at: 1600, x: 200, y: 120 })).toBe(false);
});

test('the first press opens', () => {
    expect(isDoubleClickEcho(null, open)).toBe(false);
});
