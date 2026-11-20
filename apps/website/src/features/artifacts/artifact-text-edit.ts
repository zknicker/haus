import {
    type ArtifactMetadata,
    type ArtifactRevisionConflict,
    artifactTextMaxBytes,
} from '@haus/api';
import { artifactTextRenderer } from './artifact-text.ts';

interface EditableFile {
    content_type: string;
    filename: string;
    size_bytes: number;
}

export interface ArtifactTextSaveInput {
    base_revision_id: string;
    content_type: string;
    path: string;
    text: string;
}

export type ArtifactTextSaveOutcome =
    | { artifact: ArtifactMetadata; kind: 'saved' }
    | { artifact: ArtifactMetadata; kind: 'merged' }
    | { current: ArtifactMetadata | null; kind: 'refused'; message: string };

export type ArtifactTextSaveSettled =
    | { artifact: ArtifactMetadata }
    | { conflict: ArtifactRevisionConflict };

export function artifactTextEditable(file: EditableFile, view: { pinned: boolean }) {
    return (
        !view.pinned &&
        artifactTextRenderer(file) !== null &&
        file.size_bytes <= artifactTextMaxBytes
    );
}

export function artifactTextEditorGate(state: { changed: boolean; pending: boolean }) {
    return { canSave: state.changed && !state.pending, readOnly: state.pending };
}

export function artifactTextSaveInput(
    file: { content_type: string; path: string },
    baseRevisionId: string,
    text: string
) {
    const input: ArtifactTextSaveInput = {
        base_revision_id: baseRevisionId,
        content_type: bareMediaType(file.content_type),
        path: file.path,
        text,
    };
    return input;
}

export function artifactTextSaveOutcome(settled: ArtifactTextSaveSettled, sentSha256: string) {
    let outcome: ArtifactTextSaveOutcome;
    if ('conflict' in settled) {
        outcome = {
            current: settled.conflict.current,
            kind: 'refused',
            message: settled.conflict.message,
        };
    } else {
        outcome = {
            artifact: settled.artifact,
            kind: settled.artifact.sha256 === sentSha256 ? 'saved' : 'merged',
        };
    }
    return outcome;
}

function bareMediaType(contentType: string) {
    return contentType.split(';')[0]?.trim().toLowerCase() ?? '';
}
