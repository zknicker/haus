import { expect, test } from 'bun:test';
import {
    driveAcceptsFiles,
    driveAgentName,
    driveAgentTiles,
    driveFolderIsFixed,
    driveFolderLabel,
    driveFolderTiles,
    drivePlace,
    driveRootTiles,
} from './drive-places.ts';

const listed = (path: string, file_count: number) => ({
    file_count,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    size_bytes: file_count * 100,
    updated_at: '2026-11-19T12:00:00.000Z',
});

test('a folder resolves to the root, a shelf, an area, or a pre-Drive folder', () => {
    expect(drivePlace('')).toEqual({ kind: 'root' });
    expect(drivePlace('agents')).toEqual({ kind: 'shelf', shelf: 'agents' });
    expect(drivePlace('Projects')).toEqual({ kind: 'shelf', shelf: 'projects' });
    expect(drivePlace('haus/kit/scripts')).toEqual({
        area: { kind: 'haus', root: 'haus' },
        folder: 'haus/kit/scripts',
        kind: 'area',
    });
    expect(drivePlace('agents/blippy/notes')).toEqual({
        area: { handle: 'blippy', kind: 'agent', root: 'agents/blippy' },
        folder: 'agents/blippy/notes',
        kind: 'area',
    });
    expect(drivePlace('projects/LAUNCH')).toEqual({
        area: { key: 'LAUNCH', kind: 'project', root: 'projects/LAUNCH' },
        folder: 'projects/LAUNCH',
        kind: 'area',
    });
    expect(drivePlace('starter-kit')).toEqual({ folder: 'starter-kit', kind: 'legacy' });
});

test('files land only inside an area, never on the root or a shelf', () => {
    expect(driveAcceptsFiles('')).toBe(false);
    expect(driveAcceptsFiles('agents')).toBe(false);
    expect(driveAcceptsFiles('projects')).toBe(false);
    expect(driveAcceptsFiles('haus')).toBe(true);
    expect(driveAcceptsFiles('agents/blippy')).toBe(true);
    expect(driveAcceptsFiles('projects/launch/docs')).toBe(true);
});

test('top folders read by product name and an Agent folder by the Agent', () => {
    const agentName = (handle: string) => (handle === 'blippy' ? 'Blippy' : undefined);
    expect(driveFolderLabel('', agentName)).toBe('Drive');
    expect(driveFolderLabel('haus', agentName)).toBe('Haus');
    expect(driveFolderLabel('agents', agentName)).toBe('Captains');
    expect(driveFolderLabel('agents/blippy', agentName)).toBe('Blippy');
    expect(driveFolderLabel('agents/gone', agentName)).toBe('gone');
    expect(driveFolderLabel('agents/blippy/notes', agentName)).toBe('notes');
    expect(driveFolderLabel('projects/launch', agentName)).toBe('launch');
});

test('the root always shows Haus, Projects, and Captains, counting what is there', () => {
    expect(driveRootTiles([listed('agents', 4)])).toEqual([
        { file_count: 0, name: 'Haus', path: 'haus', size_bytes: 0, updated_at: null },
        { file_count: 0, name: 'Projects', path: 'projects', size_bytes: 0, updated_at: null },
        { ...listed('agents', 4), name: 'Captains' },
    ]);
});

test('the Agents shelf holds a folder per Agent, then folders no Agent claims', () => {
    const agents = [
        { displayName: 'Blippy', handle: 'blippy' },
        { displayName: 'Tiny', handle: 'tiny' },
    ];
    expect(
        driveAgentTiles([listed('agents/retired', 2), listed('agents/tiny', 3)], agents)
    ).toEqual([
        { file_count: 0, name: 'Blippy', path: 'agents/blippy', size_bytes: 0, updated_at: null },
        { ...listed('agents/tiny', 3), name: 'Tiny' },
        listed('agents/retired', 2),
    ]);
});

test('the root keeps pre-Drive folders after the three areas, and areas list what is there', () => {
    const agents = [{ displayName: 'Blippy', handle: 'blippy' }];
    expect(driveFolderTiles('', [listed('haus', 2), listed('starter-kit', 5)], agents)).toEqual([
        { ...listed('haus', 2), name: 'Haus' },
        { file_count: 0, name: 'Projects', path: 'projects', size_bytes: 0, updated_at: null },
        { file_count: 0, name: 'Captains', path: 'agents', size_bytes: 0, updated_at: null },
        listed('starter-kit', 5),
    ]);
    expect(driveFolderTiles('agents', [], agents)).toEqual([
        { file_count: 0, name: 'Blippy', path: 'agents/blippy', size_bytes: 0, updated_at: null },
    ]);
    expect(driveFolderTiles('haus/kit', [listed('haus/kit/scripts', 1)], agents)).toEqual([
        listed('haus/kit/scripts', 1),
    ]);
});

test('the shelves and each area root keep their place; folders inside an area do not', () => {
    expect(driveFolderIsFixed('agents')).toBe(true);
    expect(driveFolderIsFixed('projects')).toBe(true);
    expect(driveFolderIsFixed('haus')).toBe(true);
    expect(driveFolderIsFixed('agents/blippy')).toBe(true);
    expect(driveFolderIsFixed('projects/launch')).toBe(true);
    expect(driveFolderIsFixed('agents/blippy/notes')).toBe(false);
    expect(driveFolderIsFixed('haus/kit')).toBe(false);
    expect(driveFolderIsFixed('starter-kit')).toBe(false);
});

test('an Agent folder finds its Agent by handle, whatever the case', () => {
    const name = driveAgentName([{ displayName: 'Blippy', handle: 'blippy' }]);
    expect(name('Blippy')).toBe('Blippy');
    expect(name('tiny')).toBeUndefined();
});
