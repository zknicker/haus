import { describe, expect, test } from 'bun:test';
import type { ArtifactCreator } from '@haus/api';
import {
    canDeleteArtifact,
    fileActions,
    folderActions,
    libraryAreaActions,
    selectionActions,
} from './artifact-actions.ts';

const ids = (actions: readonly { id: string }[]) => actions.map((action) => action.id);
const web = { canOpenInTab: false, canShowInFolder: false };
const open = { ...web, canDelete: false, canDisablePublicLink: false };

describe('fileActions', () => {
    test('the library offers every file action a member may run', () => {
        expect(ids(fileActions('library', open))).toEqual([
            'open',
            'download',
            'copy-link',
            'copy-public-link',
            'copy-path',
            'rename',
            'move',
            'history',
        ]);
    });

    test('Delete and Disable public link appear only when this viewer may run them', () => {
        const all = fileActions('library', {
            ...open,
            canDelete: true,
            canDisablePublicLink: true,
        });
        expect(ids(all)).toContain('delete');
        expect(ids(all)).toContain('disable-public-link');
        expect(all.find((action) => action.id === 'delete')?.danger).toBeTrue();
    });

    test('a desktop window opens in a new tab; a search hit or viewer shows its folder', () => {
        const desktop = ids(
            fileActions('library', { ...open, canOpenInTab: true, canShowInFolder: true })
        );
        expect(desktop.slice(0, 3)).toEqual(['open', 'open-new-tab', 'show-in-folder']);
    });

    test('the viewer drops Open, adds the revision link, and renames through a dialog', () => {
        const viewer = fileActions('viewer', open);
        expect(ids(viewer)).not.toContain('open');
        expect(ids(viewer)).toContain('copy-revision-link');
        expect(viewer.find((action) => action.id === 'rename')?.label).toBe('Rename…');
    });

    test('every action carries an icon, and groups run in order', () => {
        const all = fileActions('viewer', {
            canDelete: true,
            canDisablePublicLink: true,
            canOpenInTab: true,
            canShowInFolder: true,
        });
        expect(all.every((action) => action.icon !== undefined)).toBeTrue();
        const groups = all.map((action) => action.group);
        expect(groups).toEqual([...groups].sort((a, b) => a - b));
    });
});

describe('folder and empty-area actions', () => {
    test('folders open, download as a zip, copy a link or path, rename, and move', () => {
        expect(ids(folderActions(web))).toEqual([
            'open',
            'download',
            'copy-link',
            'copy-path',
            'rename',
            'move',
        ]);
        expect(ids(folderActions({ canOpenInTab: true, canShowInFolder: true }))).toContain(
            'show-in-folder'
        );
    });

    test('the empty area uploads into the open folder', () => {
        expect(ids(libraryAreaActions)).toEqual(['upload-files', 'upload-folder']);
    });
});

describe('selectionActions', () => {
    test('a selection downloads, copies links, and moves; single-item actions drop out', () => {
        expect(ids(selectionActions({ deletable: 0 }))).toEqual(['download', 'copy-links', 'move']);
    });

    test('Delete appears once any selected file may be deleted, every item with an icon', () => {
        const all = selectionActions({ deletable: 2 });
        expect(ids(all)).toEqual(['download', 'copy-links', 'move', 'delete']);
        expect(all.find((action) => action.id === 'delete')?.danger).toBeTrue();
        expect(all.every((action) => action.icon !== undefined)).toBeTrue();
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
