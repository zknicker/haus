import type { ArtifactMetadata, ArtifactRecord } from '@haus/api';
import { Button, TextArea, toast } from '@heroui/react';
import * as React from 'react';
import { useArtifactTextSave } from '../../hooks/artifacts/use-artifact-text-save.ts';
import { useArtifactText } from '../../hooks/artifacts/use-artifact-text.ts';
import { ArtifactTextConflict } from './artifact-text-conflict.tsx';
import { artifactTextSaveInput } from './artifact-text-edit.ts';
import { UnsavedEditGuard } from './unsaved-edit-guard.tsx';

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
    return (
        <section aria-busy={!failure} aria-label="Edit file" className="flex flex-col gap-3">
            {failure ? (
                <>
                    <p className="text-muted text-sm" role="alert">
                        {failure}
                    </p>
                    <Button className="self-start" onPress={onClose} size="sm" variant="secondary">
                        Cancel
                    </Button>
                </>
            ) : null}
        </section>
    );
}

interface Refusal {
    current: ArtifactMetadata | null;
    message: string;
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
    const [text, setText] = React.useState(original);
    const [base, setBase] = React.useState(revisionId);
    const [refusal, setRefusal] = React.useState<Refusal | null>(null);
    const dirty = text !== original;
    const canSave = (dirty || refusal !== null) && !save.isPending;

    const submit = () => {
        if (!canSave) {
            return;
        }
        save.mutate(artifactTextSaveInput(artifact, base, text), {
            onError: (error) => toast.danger('Could not save', { description: error.message }),
            onSuccess: (outcome) => {
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
                <Button isDisabled={save.isPending} onPress={onClose} size="sm" variant="secondary">
                    Cancel
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
                onChange={(event) => setText(event.target.value)}
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
            <UnsavedEditGuard dirty={dirty} />
        </section>
    );
}
