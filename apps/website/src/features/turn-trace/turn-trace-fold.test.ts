import assert from 'node:assert/strict';
import test from 'node:test';
import { foldTraceLines, formatTraceFold, traceFoldLines } from './turn-trace-fold.ts';

const lines = (count: number) =>
    Array.from({ length: count }, (_, index) => `line ${index + 1}`).join('\n');

test('a block folds to eight lines only when it holds back a real stretch', () => {
    assert.equal(foldTraceLines(lines(10)), null);
    assert.equal(foldTraceLines(`${lines(10)}\n`), null);

    const fold = foldTraceLines(lines(137));
    assert.equal(fold?.hiddenLines, 137 - traceFoldLines);
    assert.equal(fold?.head, lines(traceFoldLines));
});

test('the fold control says what pressing it does', () => {
    assert.equal(formatTraceFold(129, false), 'Show 129 more lines');
    assert.equal(formatTraceFold(1, false), 'Show 1 more line');
    assert.equal(formatTraceFold(null, false), 'Show more');
    assert.equal(formatTraceFold(129, true), 'Show less');
});
