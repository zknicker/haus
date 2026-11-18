import { expect, test } from 'bun:test';
import { formatWorkspaceFileBytes } from './chat-artifact-workspace-preview.tsx';

test('formats truthful workspace file sizes', () => {
    expect(formatWorkspaceFileBytes(512)).toBe('512 B');
    expect(formatWorkspaceFileBytes(1536)).toBe('1.5 KB');
    expect(formatWorkspaceFileBytes(2 * 1024 * 1024)).toBe('2.0 MB');
});
