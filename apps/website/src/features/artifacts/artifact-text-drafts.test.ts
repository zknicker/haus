import { afterEach, expect, test } from 'bun:test';
import { artifactPublishResultSchema } from '@haus/api';
import {
    discardArtifactTextDraft,
    findArtifactTextDraft,
    hasArtifactTextDrafts,
    readArtifactTextDraft,
    settleArtifactTextDraft,
    writeArtifactTextDraft,
} from './artifact-text-drafts.ts';

const file = { path: 'agents/blippy/AGENTS.md', serverId: 'srv_1' };
const atBase = { ...file, baseRevisionId: 'rev_2' };

const { artifact: head } = artifactPublishResultSchema.parse({
    artifact: {
        artifact_id: 'art_1',
        content_type: 'text/markdown',
        created_at: '2026-11-19T10:00:00.000Z',
        creator: { type: 'user', user_id: 'usr_1' },
        filename: 'AGENTS.md',
        path: 'agents/blippy/AGENTS.md',
        revision_id: 'rev_3',
        revision_number: 3,
        sha256: 'a'.repeat(64),
        size_bytes: 12,
        stable_url: 'https://haus.test/f/art_1',
        title: 'AGENTS.md',
        updated_at: '2026-11-19T10:05:00.000Z',
        version_url: 'https://haus.test/f/art_1/rev_3',
    },
});

afterEach(() => discardArtifactTextDraft(file));

test('a draft round-trips by server, path and base revision', () => {
    writeArtifactTextDraft(atBase, { refusal: null, text: '# Rules\n\nUnsaved' });

    expect(readArtifactTextDraft(atBase)).toEqual({
        baseRevisionId: 'rev_2',
        refusal: null,
        text: '# Rules\n\nUnsaved',
    });
    expect(readArtifactTextDraft({ ...atBase, path: 'Agents/Blippy/agents.md' })?.text).toBe(
        '# Rules\n\nUnsaved'
    );
    expect(findArtifactTextDraft(file)?.baseRevisionId).toBe('rev_2');
    expect(hasArtifactTextDrafts()).toBe(true);
});

test('a different base revision or another server gets no draft', () => {
    writeArtifactTextDraft(atBase, { refusal: null, text: 'Unsaved' });

    expect(readArtifactTextDraft({ ...atBase, baseRevisionId: 'rev_3' })).toBeNull();
    expect(readArtifactTextDraft({ ...atBase, serverId: 'srv_2' })).toBeNull();
});

test('a clean or merged save clears the draft', () => {
    writeArtifactTextDraft(atBase, { refusal: null, text: 'Unsaved' });
    settleArtifactTextDraft(atBase, 'Unsaved', { artifact: head, kind: 'saved' });
    expect(findArtifactTextDraft(file)).toBeNull();

    writeArtifactTextDraft(atBase, { refusal: null, text: 'Unsaved' });
    settleArtifactTextDraft(atBase, 'Unsaved', { artifact: head, kind: 'merged' });
    expect(findArtifactTextDraft(file)).toBeNull();
    expect(hasArtifactTextDrafts()).toBe(false);
});

test('a refused save keeps the text, now based on the current head', () => {
    writeArtifactTextDraft(atBase, { refusal: null, text: 'Unsaved' });
    settleArtifactTextDraft(atBase, 'Unsaved', {
        current: head,
        kind: 'refused',
        message: 'The file moved on.',
    });

    expect(readArtifactTextDraft(atBase)).toBeNull();
    expect(readArtifactTextDraft({ ...file, baseRevisionId: 'rev_3' })).toEqual({
        baseRevisionId: 'rev_3',
        refusal: { current: head, message: 'The file moved on.' },
        text: 'Unsaved',
    });
});

test('Discard clears the draft', () => {
    writeArtifactTextDraft(atBase, { refusal: null, text: 'Unsaved' });
    discardArtifactTextDraft(file);

    expect(readArtifactTextDraft(atBase)).toBeNull();
    expect(hasArtifactTextDrafts()).toBe(false);
});
