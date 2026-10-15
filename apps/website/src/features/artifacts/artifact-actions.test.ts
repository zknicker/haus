import { describe, expect, test } from 'bun:test';
import type { ArtifactCreator } from '@haus/api';
import {
    canDeleteArtifact,
    fileActions,
    folderActions,
    libraryAreaActions,
} from './artifact-actions.ts';

const ids = (actions: readonly { id: string }[]) => actions.map((action) => action.id);
const open = { canDelete: false, canDisablePublicLink: false };

describe('fileActions', () => {
    test('the library offers every file action a member may run', () => {
        expect(ids(fileActions('library', open))).toEqual([
            'open',
            'download',
            'copy-link',
            'copy-public-link',
            'rename',
            'move',
            'history',
        ]);
    });

    test('Delete and Disable public link appear only when this viewer may run them', () => {
        const all = fileActions('library', { canDelete: true, canDisablePublicLink: true });
        expect(ids(all)).toContain('delete');
        expect(ids(all)).toContain('disable-public-link');
        expect(all.find((action) => action.id === 'delete')?.danger).toBeTrue();
    });

    test('the viewer drops Open and adds the revision link', () => {
        const viewer = ids(fileActions('viewer', open));
        expect(viewer).not.toContain('open');
        expect(viewer).toContain('copy-revision-link');
    });

    test('groups run in order so separators fall between them', () => {
        const groups = fileActions('library', { canDelete: true, canDisablePublicLink: true }).map(
            (action) => action.group
        );
        expect(groups).toEqual([...groups].sort((a, b) => a - b));
    });
});

describe('folder and empty-area actions', () => {
    test('folders open, copy a link, rename, and move', () => {
        expect(ids(folderActions)).toEqual(['open', 'copy-link', 'rename', 'move']);
    });

    test('the empty area uploads into the open folder', () => {
        expect(ids(libraryAreaActions)).toEqual(['upload-files', 'upload-folder']);
    });
});

describe('canDeleteArtifact', () => {
    const mine: ArtifactCreator = { type: 'user', user_id: 'me' };
    const theirs: ArtifactCreator = { type: 'agent', agent_id: 'blippy' };
    const isSelf = (creator: ArtifactCreator) =>
        creator.type === 'user' && creator.user_id === 'me';

    test('members delete only their own files', () => {
        expect(canDeleteArtifact({ creator: mine, isSelf, role: 'member' })).toBeTrue();
        expect(canDeleteArtifact({ creator: theirs, isSelf, role: 'member' })).toBeFalse();
    });

    test('Owners and Admins delete anyone’s', () => {
        expect(canDeleteArtifact({ creator: theirs, isSelf, role: 'owner' })).toBeTrue();
        expect(canDeleteArtifact({ creator: theirs, isSelf, role: 'admin' })).toBeTrue();
    });
});
