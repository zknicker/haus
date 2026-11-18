import { expect, test } from 'bun:test';
import { gatherOffsets } from './use-row-flip.ts';

test('selected tabs gather toward the pressed tab, which keeps the pointer travel', () => {
    // Pressed tab moved 5px with the pointer; the other closed in 199px from the left.
    expect(gatherOffsets([-199, 5])).toEqual([-204, 0]);
    // Already side by side: everything moved with the pointer, nothing glides.
    expect(gatherOffsets([-5, -5, -5])).toEqual([0, 0, 0]);
    expect(gatherOffsets([5, 110, -97])).toEqual([0, 105, -102]);
});
