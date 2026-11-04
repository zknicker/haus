import { expect, test } from 'bun:test';
import { threadSurfaceLabel } from './thread-message-surface.tsx';

test('a plain Thread surface adds nothing to the bare Open thread label', () => {
    expect(threadSurfaceLabel({ hoisted: false })).toBeUndefined();
});

test('each surface names what it opens', () => {
    expect(threadSurfaceLabel({ hoisted: false, claimNumber: 1 })).toBe('Claim #1');
    expect(threadSurfaceLabel({ hoisted: true })).toBe('Cloud Agent work');
});

test('a claim with work running under it names both', () => {
    expect(threadSurfaceLabel({ hoisted: true, claimNumber: 4 })).toBe(
        'Claim #4, Cloud Agent work'
    );
});
