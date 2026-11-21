import { expect, test } from 'bun:test';
import type { CodexItem } from './protocol.ts';
import { toolItemStarted } from './tool-items.ts';

test('a Codex file change reports the lines each file adds and removes', () => {
    const item = {
        changes: [
            {
                diff: '@@ -1,2 +1,3 @@\n-old\n+new\n+more\n keep\n',
                kind: { type: 'update' },
                path: '/w/a.ts',
            },
            { diff: 'gone\nalso\n', kind: { type: 'delete' }, path: '/w/b.ts' },
            { kind: { type: 'add' }, path: '/w/c.ts' },
        ],
        id: 'patch_1',
        status: 'inProgress',
        type: 'fileChange',
    } as unknown as CodexItem;

    const inputs = (toolItemStarted(item, { hostToolServer: null, workspaceDir: '/w' }) ?? [])
        .filter((event) => event.type === 'tool-call' && event.toolName === 'fileChange')
        .map((event) => (event.type === 'tool-call' ? event.input : null));

    expect(inputs).toEqual([
        { additions: 2, deletions: 1, event: 'modify', path: 'a.ts' },
        { additions: 0, deletions: 2, event: 'delete', path: 'b.ts' },
        { event: 'create', path: 'c.ts' },
    ]);
});
