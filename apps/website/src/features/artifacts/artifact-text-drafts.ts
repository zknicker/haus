import { type ArtifactMetadata, artifactPathKey } from '@haus/api';
import * as React from 'react';
import { isElectronDesktopApp } from '../../lib/desktop-bridge.ts';
import type { ArtifactTextSaveOutcome } from './artifact-text-edit.ts';

export interface ArtifactTextRefusal {
    current: ArtifactMetadata | null;
    message: string;
}

export interface ArtifactTextDraft {
    baseRevisionId: string;
    refusal: ArtifactTextRefusal | null;
    text: string;
}

interface DraftFile {
    path: string;
    serverId: string;
}

type DraftTarget = DraftFile & { baseRevisionId: string };

const drafts = new Map<string, ArtifactTextDraft>();
const listeners = new Set<() => void>();

export function hasArtifactTextDrafts() {
    return drafts.size > 0;
}

export function findArtifactTextDraft(file: DraftFile) {
    return drafts.get(draftKey(file)) ?? null;
}

export function readArtifactTextDraft(target: DraftTarget) {
    const draft = findArtifactTextDraft(target);
    return draft?.baseRevisionId === target.baseRevisionId ? draft : null;
}

export function writeArtifactTextDraft(
    target: DraftTarget,
    edit: { refusal: ArtifactTextRefusal | null; text: string }
) {
    drafts.set(draftKey(target), { baseRevisionId: target.baseRevisionId, ...edit });
    notify();
}

export function discardArtifactTextDraft(file: DraftFile) {
    if (drafts.delete(draftKey(file))) {
        notify();
    }
}

export function settleArtifactTextDraft(
    target: DraftTarget,
    text: string,
    outcome: ArtifactTextSaveOutcome
) {
    if (outcome.kind !== 'refused') {
        discardArtifactTextDraft(target);
        return;
    }
    writeArtifactTextDraft(
        { ...target, baseRevisionId: outcome.current?.revision_id ?? target.baseRevisionId },
        { refusal: { current: outcome.current, message: outcome.message }, text }
    );
}

export function useArtifactTextDraftBase(file: DraftFile | null) {
    return React.useSyncExternalStore(subscribe, () =>
        file ? (findArtifactTextDraft(file)?.baseRevisionId ?? null) : null
    );
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function notify() {
    syncUnloadWarning();
    for (const listener of listeners) {
        listener();
    }
}

function syncUnloadWarning() {
    if (typeof window === 'undefined' || isElectronDesktopApp()) {
        return;
    }
    if (drafts.size > 0) {
        window.addEventListener('beforeunload', warnBeforeUnload);
    } else {
        window.removeEventListener('beforeunload', warnBeforeUnload);
    }
}

function warnBeforeUnload(event: BeforeUnloadEvent) {
    event.preventDefault();
}

function draftKey(file: DraftFile) {
    return `server:${file.serverId}:path:${artifactPathKey(file.path)}`;
}
