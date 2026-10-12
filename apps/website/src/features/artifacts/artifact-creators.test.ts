import { expect, test } from 'bun:test';
import type { ArtifactCreatorSummary, ArtifactMetadata } from '@haus/api';
import { humanDirectory } from '../servers/human-identity.ts';
import {
    artifactCreatorDirectory,
    artifactFolders,
    creatorKey,
    parseCreatorKey,
} from './artifact-creators.ts';

const preview = (id: string, updated_at: string) =>
    ({ artifact_id: id, updated_at }) as ArtifactMetadata;

const member = (userId: string, displayName: string) => ({
    avatarUrl: null,
    description: null,
    displayName,
    email: null,
    handle: null,
    joinedAt: '2026-01-01T00:00:00Z',
    role: 'member' as const,
    timezone: null,
    userId,
});
const humans = humanDirectory([member('u_self', 'Zach'), member('u_ada', 'Ada')], 'u_self');
const directory = artifactCreatorDirectory(
    [{ avatarUrl: null, displayName: 'Blippy', id: 'ag_blippy' }],
    humans
);

// The Server's order: most recently active first.
const summaries: ArtifactCreatorSummary[] = [
    {
        artifact_count: 2,
        creator: { type: 'user', user_id: 'u_ada' },
        latest_at: '2026-10-12T12:00:00Z',
        previews: [preview('ada1', '2026-10-12T12:00:00Z')],
    },
    {
        artifact_count: 5,
        creator: { agent_id: 'ag_blippy', type: 'agent' },
        latest_at: '2026-10-11T12:00:00Z',
        previews: [preview('b1', '2026-10-11T12:00:00Z'), preview('b2', '2026-10-01T00:00:00Z')],
    },
    {
        artifact_count: 1,
        creator: { agent_id: 'ag_gone', type: 'agent' },
        latest_at: '2026-10-10T12:00:00Z',
        previews: [preview('g1', '2026-10-10T12:00:00Z')],
    },
    {
        artifact_count: 3,
        creator: { type: 'user', user_id: 'u_self' },
        latest_at: '2026-10-09T12:00:00Z',
        previews: [preview('s1', '2026-10-09T12:00:00Z')],
    },
];

test('All leads, then Yours, then Agents, then other people, each in Server order', () => {
    const folders = artifactFolders(summaries, directory);
    expect(folders.map((folder) => [folder.label, folder.count])).toEqual([
        ['All files', 11],
        ['Yours', 3],
        ['Blippy', 5],
        ['Removed Agent', 1],
        ['Ada', 2],
    ]);
});

test('All previews the three newest files across creators and stays neutral', () => {
    const [all] = artifactFolders(summaries, directory);
    expect(all?.previews.map((item) => item.artifact_id)).toEqual(['ada1', 'b1', 'g1']);
    expect(all?.tone).toBe('neutral');
    expect(all?.creator).toBeNull();
});

test('an Agent folder keeps one tint across reads', () => {
    const first = artifactFolders(summaries, directory).find((folder) => folder.label === 'Blippy');
    const again = artifactFolders([...summaries].reverse(), directory).find(
        (folder) => folder.label === 'Blippy'
    );
    expect(first?.tone).not.toBe('neutral');
    expect(again?.tone).toBe(first?.tone);
});

test('creator folders get distinct tints until the tints run out', () => {
    const tones = artifactFolders(summaries, directory)
        .slice(1)
        .map((folder) => folder.tone);
    expect(new Set(tones).size).toBe(tones.length);

    const many = Array.from({ length: 7 }, (_, index) => ({
        artifact_count: 1,
        creator: { agent_id: `ag_${index}`, type: 'agent' as const },
        latest_at: '2026-10-12T12:00:00Z',
        previews: [],
    }));
    const cycled = artifactFolders(many, directory)
        .slice(1)
        .map((folder) => folder.tone);
    expect(new Set(cycled).size).toBe(5);
    expect(cycled[5]).toBe(cycled[0]);
});

test('rows name the viewer "You"; marks keep real names', () => {
    expect(directory.avatar({ type: 'user', user_id: 'u_self' }).name).toBe('Zach');
    expect(directory.name({ type: 'user', user_id: 'u_self' })).toBe('You');
    expect(directory.name({ type: 'user', user_id: 'u_ada' })).toBe('Ada');
    expect(directory.name({ agent_id: 'ag_blippy', type: 'agent' })).toBe('Blippy');
});

test('creator keys round-trip and reject malformed values', () => {
    const agent = { agent_id: 'ag_1', type: 'agent' } as const;
    expect(parseCreatorKey(creatorKey(agent))).toEqual(agent);
    expect(parseCreatorKey('user:u_1')).toEqual({ type: 'user', user_id: 'u_1' });
    expect(parseCreatorKey('team:x')).toBeNull();
    expect(parseCreatorKey('agent:')).toBeNull();
    expect(parseCreatorKey(null)).toBeNull();
});
