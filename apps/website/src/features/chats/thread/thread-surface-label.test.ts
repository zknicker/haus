import { expect, test } from 'bun:test';
import { threadSurfaceLabel } from './thread-message-surface.tsx';

test('a plain Thread surface adds nothing to the bare Open thread label', () => {
    expect(threadSurfaceLabel({ hoisted: false })).toBeUndefined();
});

test('each surface names what it opens', () => {
    expect(threadSurfaceLabel({ hoisted: false, taskNumber: 1 })).toBe('Task #1');
    expect(threadSurfaceLabel({ hoisted: true })).toBe('Cloud Agent work');
});

test('a task with work running under it names both', () => {
    expect(threadSurfaceLabel({ hoisted: true, taskNumber: 4 })).toBe('Task #4, Cloud Agent work');
});
