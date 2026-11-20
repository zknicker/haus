import { expect, test } from 'bun:test';
import type { ArtifactDeletedRecord } from '@haus/api';
import { humanDirectory } from '../servers/human-identity.ts';
import { artifactCreatorDirectory } from './artifact-creators.ts';
import { deletedRowFacts } from './drive-deleted-row.ts';

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
const directory = artifactCreatorDirectory(
    [{ avatarUrl: null, displayName: 'Blippy', id: 'ag_blippy' }],
    humanDirectory([member('u_self', 'Zach'), member('u_ada', 'Ada')], 'u_self')
);
const now = Date.parse('2026-11-20T12:00:00.000Z');
const record = (deletedBy: ArtifactDeletedRecord['deleted_by']) =>
    ({
        artifact: {
            author: { agent_id: 'ag_blippy', type: 'agent' },
            path: 'agents/blippy/notes/leads.md',
        },
        deleted_at: '2026-11-20T10:00:00.000Z',
        deleted_by: deletedBy,
    }) as ArtifactDeletedRecord;

test('a deleted row names the folder, the author, and who deleted it when', () => {
    expect(
        deletedRowFacts(record({ type: 'user', user_id: 'u_ada' }), 'agents/blippy', directory, now)
    ).toBe('notes · Blippy · Deleted by Ada 2h ago');
    expect(
        deletedRowFacts(
            record({ type: 'user', user_id: 'u_self' }),
            'agents/blippy',
            directory,
            now
        )
    ).toBe('notes · Blippy · Deleted by You 2h ago');
    expect(
        deletedRowFacts(
            record({ agent_id: 'ag_blippy', type: 'agent' }),
            'agents/blippy/notes',
            directory,
            now
        )
    ).toBe('Blippy · Deleted by Blippy 2h ago');
});

test('a file deleted before deleters were recorded says only when', () => {
    expect(deletedRowFacts(record(null), 'agents/blippy', directory, now)).toBe(
        'notes · Blippy · Deleted 2h ago'
    );
});
