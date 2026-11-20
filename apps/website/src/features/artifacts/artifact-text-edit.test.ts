import { expect, test } from 'bun:test';
import { artifactPublishResultSchema, artifactRevisionConflictSchema } from '@haus/api';
import {
    artifactTextEditable,
    artifactTextSaveInput,
    artifactTextSaveOutcome,
} from './artifact-text-edit.ts';

const sent = 'a'.repeat(64);
const other = 'b'.repeat(64);

const { artifact: head } = artifactPublishResultSchema.parse({
    artifact: {
        artifact_id: 'art_1',
        content_type: 'text/markdown',
        created_at: '2026-11-19T10:00:00.000Z',
        creator: { type: 'user', user_id: 'usr_1' },
        filename: 'SKILL.md',
        path: 'agents/blippy/skills/triage/SKILL.md',
        revision_id: 'rev_3',
        revision_number: 3,
        sha256: sent,
        size_bytes: 12,
        stable_url: 'https://haus.test/f/art_1',
        title: 'SKILL.md',
        updated_at: '2026-11-19T10:05:00.000Z',
        version_url: 'https://haus.test/f/art_1/rev_3',
    },
});

test('the current revision of a text file is editable', () => {
    const file = { content_type: 'text/markdown', filename: 'AGENTS.md', size_bytes: 2048 };
    expect(artifactTextEditable(file, { pinned: false })).toBe(true);
    expect(
        artifactTextEditable(
            { content_type: 'text/plain', filename: 'notes.txt', size_bytes: 10 },
            { pinned: false }
        )
    ).toBe(true);
});

test('a pinned older revision, a binary file, or text past the read limit is not editable', () => {
    const markdown = { content_type: 'text/markdown', filename: 'AGENTS.md', size_bytes: 2048 };
    expect(artifactTextEditable(markdown, { pinned: true })).toBe(false);
    expect(
        artifactTextEditable(
            { content_type: 'image/png', filename: 'logo.png', size_bytes: 2048 },
            { pinned: false }
        )
    ).toBe(false);
    expect(artifactTextEditable({ ...markdown, size_bytes: 1_048_577 }, { pinned: false })).toBe(
        false
    );
});

test('a save carries the edited revision as its base, the path, and a bare content type', () => {
    expect(
        artifactTextSaveInput(
            { content_type: 'Text/Markdown; charset=utf-8', path: 'agents/blippy/AGENTS.md' },
            'rev_2',
            '# Rules\n'
        )
    ).toEqual({
        base_revision_id: 'rev_2',
        content_type: 'text/markdown',
        path: 'agents/blippy/AGENTS.md',
        text: '# Rules\n',
    });
});

test('a landed revision holding the sent bytes is a clean save', () => {
    expect(artifactTextSaveOutcome({ artifact: head }, sent)).toEqual({
        artifact: head,
        kind: 'saved',
    });
});

test('a landed revision holding other bytes is the Server merge onto a newer head', () => {
    expect(artifactTextSaveOutcome({ artifact: head }, other)).toEqual({
        artifact: head,
        kind: 'merged',
    });
});

test('a revision conflict is a refused save naming the current head', () => {
    const conflict = artifactRevisionConflictSchema.parse({
        code: 'REVISION_CONFLICT',
        current: head,
        message: 'The file moved on.',
    });
    expect(artifactTextSaveOutcome({ conflict }, sent)).toEqual({
        current: head,
        kind: 'refused',
        message: 'The file moved on.',
    });
});
