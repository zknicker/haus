import type { PaneEditorSnapshot } from './use-pane-editor-host.ts';

const maxPaneDrafts = 50;
const paneDrafts = new Map<string, StoredPaneDraft>();

export function hasPaneEditorDrafts() {
    return paneDrafts.size > 0;
}

interface StoredPaneDraft {
    content: string;
    snapshot: PaneEditorSnapshot<unknown>;
}

export function readPaneEditorDraft<Document>(key: string) {
    const draft = paneDrafts.get(key);
    return draft
        ? {
              content: draft.content,
              snapshot: draft.snapshot as PaneEditorSnapshot<Document>,
          }
        : null;
}

export function writePaneEditorDraft<Document>(
    key: string,
    content: string,
    snapshot: PaneEditorSnapshot<Document>
) {
    paneDrafts.delete(key);
    paneDrafts.set(key, { content, snapshot: snapshot as PaneEditorSnapshot<unknown> });
    while (paneDrafts.size > maxPaneDrafts) {
        const oldestKey = paneDrafts.keys().next().value;
        if (oldestKey === undefined) {
            break;
        }
        paneDrafts.delete(oldestKey);
    }
}

export function clearPaneEditorDraft(key: string) {
    paneDrafts.delete(key);
}
