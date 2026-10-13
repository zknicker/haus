import { expect, test } from 'bun:test';
import type { ArtifactCreatorSummary } from '@haus/api';
import { humanDirectory } from '../servers/human-identity.ts';
import {
    artifactCreatorDirectory,
    artifactCreatorOptions,
    creatorKey,
    parseCreatorKey,
} from './artifact-creators.ts';

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
const summary = (creator: ArtifactCreatorSummary['creator']) =>
    ({ creator }) as ArtifactCreatorSummary;

// The Server's order: most recently active first.
const summaries = [
    summary({ type: 'user', user_id: 'u_ada' }),
    summary({ agent_id: 'ag_blippy', type: 'agent' }),
    summary({ agent_id: 'ag_gone', type: 'agent' }),
    summary({ type: 'user', user_id: 'u_self' }),
];

test('Created by lists You, then Agents, then other people, each in Server order', () => {
    expect(artifactCreatorOptions(summaries, directory).map((option) => option.label)).toEqual([
        'You',
        'Blippy',
        'Removed Agent',
        'Ada',
    ]);
});

test('an open creator filter keeps its entry after its last file is gone', () => {
    const options = artifactCreatorOptions([], directory, { type: 'user', user_id: 'u_ada' });
    expect(options).toEqual([
        { creator: { type: 'user', user_id: 'u_ada' }, key: 'user:u_ada', label: 'Ada' },
    ]);
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
