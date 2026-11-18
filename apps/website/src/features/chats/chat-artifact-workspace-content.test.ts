import { expect, test } from 'bun:test';
import type { WorkspaceFileEntry } from '@haus/api';
import {
    buildWorkspaceTree,
    filterWorkspaceTree,
    type WorkspaceDirectoryListings,
    type WorkspaceTreeNode,
    workspaceAncestorPaths,
    workspaceDirectoryExists,
    workspaceExpandableKeys,
} from './chat-artifact-workspace-model.ts';

function directory(path: string): WorkspaceFileEntry {
    return {
        kind: 'directory',
        mediaType: null,
        name: path.split('/').at(-1) ?? path,
        path,
        sizeBytes: null,
        updatedAt: null,
    };
}

function file(path: string): WorkspaceFileEntry {
    return {
        kind: 'file',
        mediaType: 'text/markdown',
        name: path.split('/').at(-1) ?? path,
        path,
        sizeBytes: 123,
        updatedAt: '2026-06-25T00:00:00.000Z',
    };
}

function paths(nodes: WorkspaceTreeNode[]): string[] {
    return nodes.flatMap((node) => [
        node.kind === 'notice' ? `(${node.name})` : node.id,
        ...paths(node.kind === 'directory' ? node.children : []),
    ]);
}

function ready(
    entriesByDirectory: Record<string, WorkspaceFileEntry[]>
): WorkspaceDirectoryListings {
    return Object.fromEntries(
        Object.entries(entriesByDirectory).map(([path, entries]) => [
            path,
            { entries, status: 'ready' as const },
        ])
    );
}

test('buildWorkspaceTree nests a loaded directory under its root entry', () => {
    const tree = buildWorkspaceTree(
        ready({
            '': [directory('out'), file('NOTES.md')],
            out: [file('out/preview.html')],
        })
    );

    expect(paths(tree)).toEqual(['out', 'out/preview.html', 'NOTES.md']);
});

test('buildWorkspaceTree synthesizes ancestors for a directory loaded on its own', () => {
    const tree = buildWorkspaceTree(ready({ 'out/nested': [file('out/nested/preview.html')] }));

    expect(paths(tree)).toEqual(['out', 'out/nested', 'out/nested/preview.html']);
});

test('buildWorkspaceTree keeps directories expandable before their listing arrives', () => {
    const tree = buildWorkspaceTree(ready({ '': [directory('out')] }));

    expect(tree[0]).toMatchObject({ children: [], kind: 'directory' });
});

test('buildWorkspaceTree sorts directories first, then names naturally', () => {
    const tree = buildWorkspaceTree(
        ready({
            '': [file('b.md'), file('a10.md'), file('a2.md'), directory('zed')],
        })
    );

    expect(paths(tree)).toEqual(['zed', 'a2.md', 'a10.md', 'b.md']);
});

test('filterWorkspaceTree keeps ancestors of a matching file', () => {
    const tree = buildWorkspaceTree(
        ready({
            '': [directory('out'), file('NOTES.md')],
            out: [file('out/preview.html'), file('out/other.txt')],
        })
    );

    expect(paths(filterWorkspaceTree(tree, 'preview'))).toEqual(['out', 'out/preview.html']);
});

test('filterWorkspaceTree matches names, so a folder hit keeps only matching children', () => {
    const tree = buildWorkspaceTree(
        ready({
            '': [directory('out'), file('NOTES.md')],
            out: [file('out/preview.html'), file('out/other.txt')],
        })
    );

    expect(paths(filterWorkspaceTree(tree, 'out'))).toEqual(['out']);
    expect(paths(filterWorkspaceTree(tree, 'o'))).toEqual(['out', 'out/other.txt', 'NOTES.md']);
});

test('filterWorkspaceTree returns the same tree for an empty query', () => {
    const tree = buildWorkspaceTree(ready({ '': [file('NOTES.md')] }));

    expect(filterWorkspaceTree(tree, '   ')).toBe(tree);
});

test('workspaceAncestorPaths lists every folder above a file, outermost first', () => {
    expect(workspaceAncestorPaths('out/nested/preview.html')).toEqual(['out', 'out/nested']);
    expect(workspaceAncestorPaths('NOTES.md')).toEqual([]);
});

test('buildWorkspaceTree renders top-level entries at the root, with no synthetic wrapper', () => {
    const tree = buildWorkspaceTree(ready({ '': [directory('out'), file('NOTES.md')] }));

    expect(tree.map((node) => node.id)).toEqual(['out', 'NOTES.md']);
});

test('buildWorkspaceTree puts a notice under a loading, empty, or failed folder', () => {
    const tree = buildWorkspaceTree({
        '': { entries: [directory('a'), directory('b'), directory('c')], status: 'ready' },
        a: { status: 'loading' },
        b: { entries: [], status: 'ready' },
        c: { status: 'error' },
    });

    expect(paths(tree)).toEqual([
        'a',
        '(Loading…)',
        'b',
        '(Empty folder)',
        'c',
        '(Couldn’t load this folder)',
    ]);
    expect(paths(filterWorkspaceTree(tree, 'a'))).toEqual(['a']);
});

test('workspaceExpandableKeys lists only folders with rows to reveal', () => {
    const tree = buildWorkspaceTree(
        ready({ '': [directory('out'), directory('empty')], out: [file('out/x.md')] })
    );

    expect(workspaceExpandableKeys(tree)).toEqual(['out']);
});

test('workspaceDirectoryExists refutes a folder only from a listing in hand', () => {
    const listings = ready({ '': [directory('out')], out: [] });

    expect(workspaceDirectoryExists('out', listings)).toBe(true);
    expect(workspaceDirectoryExists('gone', listings)).toBe(false);
    expect(workspaceDirectoryExists('out/nested', listings)).toBe(false);
    expect(workspaceDirectoryExists('unknown/nested', {})).toBe(true);
});
