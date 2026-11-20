import type { ArtifactRecord } from '@haus/api';
import { Button, TextArea, toast } from '@heroui/react';
import * as React from 'react';
import { useArtifactTextSave } from '../../hooks/artifacts/use-artifact-text-save.ts';
import { useArtifactText } from '../../hooks/artifacts/use-artifact-text.ts';
import { ArtifactTextConflict } from './artifact-text-conflict.tsx';
import {
    type ArtifactTextRefusal,
    discardArtifactTextDraft,
    findArtifactTextDraft,
    readArtifactTextDraft,
    settleArtifactTextDraft,
    writeArtifactTextDraft,
} from './artifact-text-drafts.ts';
import { artifactTextSaveInput } from './artifact-text-edit.ts';

export function ArtifactTextEditor({
    artifact,
    onClose,
    revisionId,
    serverId,
}: {
    artifact: ArtifactRecord;
    onClose: () => void;
    revisionId: string;
    serverId: string;
}) {
    const read = useArtifactText(serverId, artifact.artifact_id, revisionId);
    if (read.data?.status === 'text') {
        return (
            <TextDraft
                artifact={artifact}
                onClose={onClose}
                original={read.data.text}
                revisionId={revisionId}
                serverId={serverId}
            />
        );
    }
    const failure = read.error
        ? read.error.message
        : read.data
          ? 'This file is not readable as text.'
          : null;
    const file = { path: artifact.path, serverId };
    return (
        <section aria-busy={!failure} aria-label="Edit file" className="flex flex-col gap-3">
            {failure ? (
                <>
                    <p className="text-muted text-sm" role="alert">
                        {failure}
                    </p>
                    <Button
                        className="self-start"
                        onPress={() => {
                            discardArtifactTextDraft(file);
                            onClose();
                        }}
                        size="sm"
                        variant="secondary"
                    >
                        {findArtifactTextDraft(file) ? 'Discard changes' : 'Cancel'}
                    </Button>
                </>
            ) : null}
        </section>
    );
}

function TextDraft({
    artifact,
    onClose,
    original,
    revisionId,
    serverId,
}: {
    artifact: ArtifactRecord;
    onClose: () => void;
    original: string;
    revisionId: string;
    serverId: string;
}) {
    const save = useArtifactTextSave(serverId, artifact.artifact_id);
    const [file] = React.useState(() => ({ path: artifact.path, serverId }));
    const [restored] = React.useState(() =>
        readArtifactTextDraft({ ...file, baseRevisionId: revisionId })
    );
    const [text, setText] = React.useState(restored?.text ?? original);
    const [base, setBase] = React.useState(revisionId);
    const [refusal, setRefusal] = React.useState<ArtifactTextRefusal | null>(
        restored?.refusal ?? null
    );
    const changed = text !== original || refusal !== null;
    const canSave = changed && !save.isPending;

    const edit = (next: string) => {
        setText(next);
        if (next === original && refusal === null) {
            discardArtifactTextDraft(file);
        } else {
            writeArtifactTextDraft({ ...file, baseRevisionId: base }, { refusal, text: next });
        }
    };
    const discard = () => {
        discardArtifactTextDraft(file);
        onClose();
    };
    const submit = () => {
        if (!canSave) {
            return;
        }
        const target = { ...file, baseRevisionId: base };
        save.mutate(artifactTextSaveInput(artifact, base, text), {
            onError: (error) => toast.danger('Could not save', { description: error.message }),
            onSuccess: (outcome) => {
                settleArtifactTextDraft(target, text, outcome);
                if (outcome.kind === 'refused') {
                    setRefusal({ current: outcome.current, message: outcome.message });
                    if (outcome.current) {
                        setBase(outcome.current.revision_id);
                    }
                    return;
                }
                const number = outcome.artifact.revision_number;
                if (outcome.kind === 'merged') {
                    toast.success(`Saved and merged as revision ${number}`, {
                        description: 'Changes made while you edited were kept.',
                    });
                } else {
                    toast.success(`Saved as revision ${number}`);
                }
                onClose();
            },
        });
    };

    return (
        <section aria-label="Edit file" className="flex min-w-0 flex-col gap-3">
            <div className="flex items-center justify-end gap-2">
                <Button isDisabled={save.isPending} onPress={discard} size="sm" variant="secondary">
                    {changed ? 'Discard changes' : 'Cancel'}
                </Button>
                <Button
                    isDisabled={!canSave}
                    isPending={save.isPending}
                    onPress={submit}
                    size="sm"
                    variant="primary"
                >
                    Save
                </Button>
            </div>
            {refusal ? (
                <ArtifactTextConflict
                    current={refusal.current}
                    message={refusal.message}
                    serverId={serverId}
                    text={text}
                />
            ) : null}
            <TextArea
                aria-label={`Edit ${artifact.filename}`}
                autoFocus
                className="min-h-96 resize-y font-mono"
                fullWidth
                onChange={(event) => edit(event.target.value)}
                onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
                        event.preventDefault();
                        submit();
                    }
                }}
                spellCheck={false}
                value={text}
                variant="secondary"
            />
        </section>
    );
}
