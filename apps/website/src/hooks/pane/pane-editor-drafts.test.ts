import { expect, test } from 'bun:test';
import {
    clearPaneEditorDraft,
    readPaneEditorDraft,
    writePaneEditorDraft,
} from './pane-editor-drafts.ts';

test('restores and clears drafts by pane target', () => {
    const key = 'wiki:Projects/Launch.md';
    const snapshot = {
        content: '# Launch',
        document: { path: 'Projects/Launch.md' },
        revision: 'revision-1',
    };
    clearPaneEditorDraft(key);

    writePaneEditorDraft(key, '# Launch\n\nUnsaved', snapshot);

    expect(readPaneEditorDraft(key)).toEqual({
        content: '# Launch\n\nUnsaved',
        snapshot,
    });
    clearPaneEditorDraft(key);
    expect(readPaneEditorDraft(key)).toBeNull();
});
