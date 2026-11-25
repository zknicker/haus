import type { ArtifactRecord } from '@haus/api';
import { toast } from '@heroui/react';
import * as React from 'react';
import { useArtifactTextSave } from '../../hooks/artifacts/use-artifact-text-save.ts';
import { useArtifactText } from '../../hooks/artifacts/use-artifact-text.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type ArtifactTextRefusal,
    discardArtifactTextDraft,
    findArtifactTextDraft,
    settleArtifactTextDraft,
    writeArtifactTextDraft,
} from './artifact-text-drafts.ts';
import { artifactTextSaveInput } from './artifact-text-edit.ts';

interface SessionState {
    base: string;
    generation: number;
    head: string;
    refusal: ArtifactTextRefusal | null;
    text: string | null;
}

export function useArtifactTextSession({
    artifact,
    pinnedRevisionId,
    serverId,
}: {
    artifact: ArtifactRecord;
    pinnedRevisionId: string | undefined;
    serverId: string;
}) {
    const save = useArtifactTextSave(serverId, artifact.artifact_id);
    const utils = hausTrpc.useUtils();
    const [file] = React.useState(() => ({ path: artifact.path, serverId }));
    const [state, setState] = React.useState(() => initialState(artifact, file, pinnedRevisionId));
    let current = state;
    if (current.head !== artifact.revision_id) {
        const follows = !pinnedRevisionId && current.text === null && current.refusal === null;
        current =
            follows && current.base !== artifact.revision_id
                ? {
                      ...current,
                      base: artifact.revision_id,
                      generation: current.generation + 1,
                      head: artifact.revision_id,
                  }
                : { ...current, head: artifact.revision_id };
        setState(current);
    }
    const read = useArtifactText(serverId, artifact.artifact_id, current.base);
    const original = read.data?.status === 'text' ? read.data.text : null;
    const text = current.text ?? original;
    const readOnly = pinnedRevisionId !== undefined;
    const dirty = current.text !== null || current.refusal !== null;
    const latestRef = React.useRef(current.text);

    const edit = (next: string) => {
        if (readOnly) {
            return;
        }
        const unchanged = next === original && current.refusal === null;
        latestRef.current = unchanged ? null : next;
        setState((previous) => ({ ...previous, text: unchanged ? null : next }));
        if (unchanged) {
            discardArtifactTextDraft(file);
        } else {
            writeArtifactTextDraft(
                { ...file, baseRevisionId: current.base },
                { refusal: current.refusal, text: next }
            );
        }
    };

    const discard = () => {
        discardArtifactTextDraft(file);
        latestRef.current = null;
        setState((previous) => ({
            ...previous,
            base: pinnedRevisionId ?? artifact.revision_id,
            generation: previous.generation + 1,
            refusal: null,
            text: null,
        }));
    };

    const submit = () => {
        if (!dirty || save.isPending || text === null) {
            return;
        }
        const target = { ...file, baseRevisionId: current.base };
        save.mutate(artifactTextSaveInput(artifact, current.base, text), {
            onError: (error) => toast.danger('Could not save', { description: error.message }),
            onSuccess: (outcome) => {
                settleArtifactTextDraft(target, text, outcome);
                if (outcome.kind === 'refused') {
                    const refusal = { current: outcome.current, message: outcome.message };
                    setState((previous) => ({
                        ...previous,
                        base: outcome.current?.revision_id ?? previous.base,
                        refusal,
                    }));
                    return;
                }
                const revision = {
                    artifact_id: artifact.artifact_id,
                    revision_id: outcome.artifact.revision_id,
                    serverId,
                };
                const merged = outcome.kind === 'merged';
                if (!merged) {
                    utils.artifact.text.setData(revision, { status: 'text', text });
                }
                const typedSince = latestRef.current !== text ? latestRef.current : null;
                latestRef.current = typedSince;
                if (typedSince !== null) {
                    writeArtifactTextDraft(
                        { ...file, baseRevisionId: outcome.artifact.revision_id },
                        { refusal: null, text: typedSince }
                    );
                }
                setState((previous) => ({
                    ...previous,
                    base: outcome.artifact.revision_id,
                    generation: previous.generation + (merged && typedSince === null ? 1 : 0),
                    refusal: null,
                    text: typedSince,
                }));
                const number = outcome.artifact.revision_number;
                if (merged) {
                    toast.success(`Saved and merged as revision ${number}`, {
                        description: 'Changes made while you edited were kept.',
                    });
                } else {
                    toast.success(`Saved as revision ${number}`);
                }
            },
        });
    };

    return {
        base: current.base,
        dirty,
        discard,
        edit,
        generation: current.generation,
        original,
        read,
        readOnly,
        refusal: current.refusal,
        save: submit,
        saving: save.isPending,
        text,
    };
}

export type ArtifactTextSession = ReturnType<typeof useArtifactTextSession>;

function initialState(
    artifact: ArtifactRecord,
    file: { path: string; serverId: string },
    pinnedRevisionId: string | undefined
) {
    const draft = pinnedRevisionId ? null : findArtifactTextDraft(file);
    const head = artifact.revision_id;
    const state: SessionState = draft
        ? {
              base: draft.baseRevisionId,
              generation: 0,
              head,
              refusal: draft.refusal,
              text: draft.text,
          }
        : { base: pinnedRevisionId ?? head, generation: 0, head, refusal: null, text: null };
    return state;
}
