import * as React from 'react';
import {
    clearPaneEditorDraft,
    readPaneEditorDraft,
    writePaneEditorDraft,
} from './pane-editor-drafts.ts';

export interface PaneEditorTarget {
    key: string;
    kind: string;
    label: string;
}

export interface PaneEditorSnapshot<Document> {
    content: string;
    document: Document;
    revision: string;
}

export interface PaneEditorTargetAdapter<Document> {
    conflictMessage: (error: unknown) => string | null;
    isLoading: boolean;
    isWriting: boolean;
    refresh: () => Promise<PaneEditorSnapshot<Document> | null>;
    snapshot: PaneEditorSnapshot<Document> | null;
    target: PaneEditorTarget;
    write: (input: {
        content: string;
        expectedRevision: string;
    }) => Promise<PaneEditorSnapshot<Document>>;
}

export function usePaneEditorHost<Document>(adapter: PaneEditorTargetAdapter<Document>) {
    const initialDraftRef = React.useRef(readPaneEditorDraft<Document>(adapter.target.key));
    const [draft, setDraftState] = React.useState(initialDraftRef.current?.content ?? '');
    const draftRef = React.useRef(draft);
    const [, refreshHost] = React.useReducer((revision: number) => revision + 1, 0);
    const [externalChange, setExternalChange] = React.useState<'changed' | 'missing' | null>(null);
    const [saveError, setSaveError] = React.useState<string | null>(null);
    const externalSnapshotRef = React.useRef<PaneEditorSnapshot<Document> | null | undefined>(
        undefined
    );
    const syncedRef = React.useRef<PaneEditorSnapshot<Document> | null>(
        initialDraftRef.current?.snapshot ?? null
    );
    const activeTargetKeyRef = React.useRef(adapter.target.key);
    const targetKeyRef = React.useRef(adapter.target.key);
    activeTargetKeyRef.current = adapter.target.key;
    const setDraftValue = React.useCallback((content: string) => {
        draftRef.current = content;
        setDraftState(content);
    }, []);
    const synced = syncedRef.current;
    const dirty = Boolean(synced && draft !== synced.content);
    const targetChangedDuringRender = targetKeyRef.current !== adapter.target.key;
    const pendingTargetDraft = targetChangedDuringRender
        ? readPaneEditorDraft<Document>(adapter.target.key)
        : null;

    React.useEffect(() => {
        const targetChanged = targetKeyRef.current !== adapter.target.key;
        const previous = syncedRef.current;
        const wasDirty = Boolean(!targetChanged && previous && draft !== previous.content);
        targetKeyRef.current = adapter.target.key;

        if (targetChanged) {
            const savedDraft = readPaneEditorDraft<Document>(adapter.target.key);
            if (savedDraft) {
                syncedRef.current = savedDraft.snapshot;
                setDraftValue(savedDraft.content);
                setSaveError(null);
                if (!adapter.snapshot) {
                    externalSnapshotRef.current = adapter.isLoading ? undefined : null;
                    setExternalChange(adapter.isLoading ? null : 'missing');
                } else if (
                    adapter.snapshot.revision !== savedDraft.snapshot.revision ||
                    adapter.snapshot.content !== savedDraft.snapshot.content
                ) {
                    externalSnapshotRef.current = adapter.snapshot;
                    setExternalChange('changed');
                } else {
                    externalSnapshotRef.current = undefined;
                    setExternalChange(null);
                }
                return;
            }
            externalSnapshotRef.current = undefined;
            syncedRef.current = adapter.snapshot;
            setDraftValue(adapter.snapshot?.content ?? '');
            clearPaneEditorDraft(adapter.target.key);
            setExternalChange(null);
            setSaveError(null);
            return;
        }

        if (!adapter.snapshot) {
            if (adapter.isLoading) {
                return;
            }
            if (previous && wasDirty) {
                externalSnapshotRef.current = null;
                setExternalChange('missing');
                return;
            }
            externalSnapshotRef.current = undefined;
            syncedRef.current = null;
            setDraftValue('');
            setExternalChange(null);
            setSaveError(null);
            return;
        }

        const serverChanged =
            targetChanged ||
            previous?.revision !== adapter.snapshot.revision ||
            previous.content !== adapter.snapshot.content;
        if (!wasDirty) {
            externalSnapshotRef.current = undefined;
            syncedRef.current = adapter.snapshot;
            setDraftValue(adapter.snapshot.content);
            clearPaneEditorDraft(adapter.target.key);
            setExternalChange(null);
            setSaveError(null);
            return;
        }
        if (!serverChanged) {
            if (externalChange === 'missing') {
                externalSnapshotRef.current = undefined;
                setExternalChange(null);
            }
            return;
        }
        if (serverChanged) {
            externalSnapshotRef.current = adapter.snapshot;
            setExternalChange('changed');
        }
    }, [
        adapter.isLoading,
        adapter.snapshot,
        adapter.target.key,
        draft,
        externalChange,
        setDraftValue,
    ]);

    const replaceSnapshot = React.useCallback(
        (snapshot: PaneEditorSnapshot<Document>) => {
            externalSnapshotRef.current = undefined;
            syncedRef.current = snapshot;
            setDraftValue(snapshot.content);
            clearPaneEditorDraft(targetKeyRef.current);
            setExternalChange(null);
            setSaveError(null);
            refreshHost();
        },
        [setDraftValue]
    );

    const reload = React.useCallback(() => {
        const snapshot =
            externalSnapshotRef.current === undefined
                ? adapter.snapshot
                : externalSnapshotRef.current;
        externalSnapshotRef.current = undefined;
        syncedRef.current = snapshot;
        setDraftValue(snapshot?.content ?? '');
        clearPaneEditorDraft(adapter.target.key);
        setExternalChange(null);
        setSaveError(null);
    }, [adapter.snapshot, adapter.target.key, setDraftValue]);

    const keepDraft = React.useCallback(() => {
        const snapshot =
            externalSnapshotRef.current === undefined
                ? adapter.snapshot
                : externalSnapshotRef.current;
        if (snapshot) {
            syncedRef.current = snapshot;
            if (draft !== snapshot.content) {
                writePaneEditorDraft(adapter.target.key, draft, snapshot);
            }
        }
        externalSnapshotRef.current = undefined;
        setExternalChange(null);
        setSaveError(null);
    }, [adapter.snapshot, adapter.target.key, draft]);

    const setDraft = React.useCallback(
        (content: string) => {
            if (targetKeyRef.current !== adapter.target.key) {
                return;
            }
            setDraftValue(content);
            const snapshot = syncedRef.current;
            if (snapshot && content !== snapshot.content) {
                writePaneEditorDraft(adapter.target.key, content, snapshot);
            } else {
                clearPaneEditorDraft(adapter.target.key);
            }
        },
        [adapter.target.key, setDraftValue]
    );

    const save = React.useCallback(async () => {
        if (targetKeyRef.current !== adapter.target.key) {
            return;
        }
        const targetKey = adapter.target.key;
        const submittedContent = draft;
        const current = syncedRef.current;
        if (!current || draft === current.content || adapter.isWriting) {
            return;
        }
        setSaveError(null);
        try {
            const snapshot = await adapter.write({
                content: submittedContent,
                expectedRevision: current.revision,
            });
            if (activeTargetKeyRef.current === targetKey) {
                const latestDraft = draftRef.current;
                if (latestDraft === submittedContent) {
                    replaceSnapshot(snapshot);
                } else {
                    externalSnapshotRef.current = undefined;
                    syncedRef.current = snapshot;
                    if (latestDraft === snapshot.content) {
                        clearPaneEditorDraft(targetKey);
                    } else {
                        writePaneEditorDraft(targetKey, latestDraft, snapshot);
                    }
                    setExternalChange(null);
                    setSaveError(null);
                    refreshHost();
                }
            } else {
                const storedDraft = readPaneEditorDraft<Document>(targetKey);
                if (storedDraft && storedDraft.content !== submittedContent) {
                    writePaneEditorDraft(targetKey, storedDraft.content, snapshot);
                } else {
                    clearPaneEditorDraft(targetKey);
                }
            }
        } catch (error) {
            if (activeTargetKeyRef.current !== targetKey) {
                return;
            }
            const conflict = adapter.conflictMessage(error);
            if (conflict) {
                const latest = await adapter.refresh().catch(() => undefined);
                if (activeTargetKeyRef.current !== targetKey) {
                    return;
                }
                if (latest === undefined) {
                    externalSnapshotRef.current = undefined;
                    setExternalChange(null);
                    setSaveError(
                        `${conflict} Unable to load the latest version; your draft is preserved.`
                    );
                    return;
                }
                externalSnapshotRef.current = latest;
                setExternalChange(latest === null ? 'missing' : 'changed');
                setSaveError(conflict);
                return;
            }
            setSaveError(error instanceof Error ? error.message : 'Unable to save this file.');
        }
    }, [adapter, draft, replaceSnapshot]);

    return {
        canSave: Boolean(!targetChangedDuringRender && synced && dirty && !adapter.isWriting),
        dirty: targetChangedDuringRender
            ? Boolean(
                  pendingTargetDraft &&
                  pendingTargetDraft.content !== pendingTargetDraft.snapshot.content
              )
            : dirty,
        draft: targetChangedDuringRender
            ? (pendingTargetDraft?.content ?? adapter.snapshot?.content ?? '')
            : draft,
        externalChange: targetChangedDuringRender ? null : externalChange,
        keepDraft,
        lastSnapshot: targetChangedDuringRender
            ? (pendingTargetDraft?.snapshot ?? adapter.snapshot)
            : synced,
        reload,
        replaceSnapshot,
        save,
        saveError,
        setDraft,
    };
}
