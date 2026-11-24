import { expect, test } from 'bun:test';
import {
    driveTreeAncestors,
    driveTreeIndex,
    driveTreeMatches,
    driveTreeNodes,
    driveTreeRoot,
} from './drive-tree-model.ts';

const file = (path: string, artifact_id = path) => ({
    artifact_id,
    content_type: 'text/plain',
    filename: path.slice(path.lastIndexOf('/') + 1),
    path,
});

const folder = (path: string) => ({ name: path.slice(path.lastIndexOf('/') + 1), path });

test('a file roots its tree at its Drive area, shelf, or legacy top folder', () => {
    expect(driveTreeRoot('haus/notes/plan.md')).toBe('haus');
    expect(driveTreeRoot('haus/plan.md')).toBe('haus');
    expect(driveTreeRoot('projects/acme/specs/v2/brief.md')).toBe('projects/acme');
    expect(driveTreeRoot('projects/acme/brief.md')).toBe('projects/acme');
    expect(driveTreeRoot('agents/blippy/out/shot.png')).toBe('agents/blippy');
    expect(driveTreeRoot('projects/loose.md')).toBe('projects');
    expect(driveTreeRoot('starter-kit/scripts/run.sh')).toBe('starter-kit');
    expect(driveTreeRoot('readme.md')).toBe('');
});

test('ancestors run from below the root to the file folder, outermost first', () => {
    expect(driveTreeAncestors('projects/acme', 'projects/acme/specs/v2/brief.md')).toEqual([
        'projects/acme/specs',
        'projects/acme/specs/v2',
    ]);
    expect(driveTreeAncestors('projects/acme', 'projects/acme/brief.md')).toEqual([]);
    expect(driveTreeAncestors('', 'a/b/c.txt')).toEqual(['a', 'a/b']);
    expect(driveTreeAncestors('', 'c.txt')).toEqual([]);
});

test('listed folders nest their read children, folders before files in natural order', () => {
    const listings = new Map([
        [
            'haus',
            {
                artifacts: [file('haus/b10.md'), file('haus/b2.md')],
                folders: [folder('haus/Zeta'), folder('haus/alpha')],
            },
        ],
        ['haus/zeta', { artifacts: [file('haus/Zeta/inner.txt')], folders: [] }],
    ]);
    const nodes = driveTreeNodes('haus', listings);
    expect(nodes.map((node) => node.name)).toEqual(['alpha', 'Zeta', 'b2.md', 'b10.md']);
    const [alpha, zeta] = nodes;
    expect(alpha?.kind === 'folder' && alpha.children).toEqual([]);
    expect(zeta?.kind === 'folder' && zeta.children.map((node) => node.id)).toEqual([
        'file:haus/Zeta/inner.txt',
    ]);
    expect(driveTreeNodes('haus/unread', listings)).toEqual([]);
});

test('search matches nest under their folders below the root, every folder open', () => {
    const { expandedIds, nodes } = driveTreeMatches('projects/acme', [
        file('projects/acme/specs/v2/brief.md'),
        file('projects/acme/specs/a.md'),
        file('projects/acme/top.md'),
    ]);
    expect(expandedIds).toEqual(['folder:projects/acme/specs', 'folder:projects/acme/specs/v2']);
    expect(nodes.map((node) => node.name)).toEqual(['specs', 'top.md']);
    const index = driveTreeIndex(nodes);
    const specs = index.get('folder:projects/acme/specs');
    expect(specs?.kind === 'folder' && specs.children.map((node) => node.name)).toEqual([
        'v2',
        'a.md',
    ]);
    expect(index.get('file:projects/acme/specs/v2/brief.md')?.kind).toBe('file');
});
