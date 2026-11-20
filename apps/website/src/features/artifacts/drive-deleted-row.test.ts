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

test('who deleted a file and when lead the row, ahead of the author and the folder', () => {
    expect(
        deletedRowFacts(record({ type: 'user', user_id: 'u_ada' }), 'agents/blippy', directory, now)
    ).toBe('Deleted by Ada 2h ago · Blippy · notes');
    expect(
        deletedRowFacts(
            record({ type: 'user', user_id: 'u_self' }),
            'agents/blippy',
            directory,
            now
        )
    ).toBe('Deleted by You 2h ago · Blippy · notes');
    expect(
        deletedRowFacts(
            record({ agent_id: 'ag_blippy', type: 'agent' }),
            'agents/blippy/notes',
            directory,
            now
        )
    ).toBe('Deleted by Blippy 2h ago · Blippy');
});

test('a deep folder is shortened in the middle so its last folder survives', () => {
    const deep = {
        ...record({ type: 'user', user_id: 'u_self' }),
        artifact: {
            author: { agent_id: 'ag_blippy', type: 'agent' },
            path: 'agents/blippy/skills/visuals/references/fragments/sparkline.md',
        },
    } as ArtifactDeletedRecord;
    expect(deletedRowFacts(deep, 'agents/blippy', directory, now)).toBe(
        'Deleted by You 2h ago · Blippy · skills/visuals…ces/fragments'
    );
});

test('a file deleted before deleters were recorded says only when', () => {
    expect(deletedRowFacts(record(null), 'agents/blippy', directory, now)).toBe(
        'Deleted 2h ago · Blippy · notes'
    );
});
