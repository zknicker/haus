import { artifactPathBasename } from '@haus/api';
import { Input, toast } from '@heroui/react';
import * as React from 'react';
import { artifactMoveMessage, useArtifactMove } from '../../hooks/artifacts/use-artifact-move.ts';
import {
    type ArtifactRenameTarget,
    renameCandidate,
    renameMove,
    selectRenameStem,
} from './artifact-rename.ts';

/**
 * Finder's in-place rename: the row's or tile's name becomes a field with the
 * name selected up to its extension. Return or leaving the field commits,
 * Escape cancels. A refused name toasts its reason and, after Return, stays
 * in the field to fix. Every key and press stays inside the field, so the
 * collection around it (selection, typeahead, Return-to-open) never sees them.
 */
export function ArtifactInlineRename({
    onDone,
    serverId,
    target,
}: {
    onDone: () => void;
    serverId: string;
    target: ArtifactRenameTarget;
}) {
    const move = useArtifactMove(serverId);
    const [name, setName] = React.useState(artifactPathBasename(target.path));
    // Refs, not state: a blur can land while a Return's move is still in flight.
    const settled = React.useRef(false);
    const pending = React.useRef(false);

    /** Leaving the field gives up on a refused name; Return keeps it there to fix. */
    async function commit(leaving: boolean) {
        if (settled.current || pending.current) {
            return;
        }
        const candidate = renameCandidate(target, name);
        if (candidate.status === 'unchanged') {
            settled.current = true;
            onDone();
            return;
        }
        if (candidate.status === 'invalid') {
            toast.danger('Could not rename', { description: candidate.message });
            if (leaving) {
                settled.current = true;
                onDone();
            }
            return;
        }
        pending.current = true;
        try {
            await move.move(renameMove(target, candidate.to));
            settled.current = true;
            onDone();
        } catch (error) {
            pending.current = false;
            toast.danger('Could not rename', { description: artifactMoveMessage(error) });
            if (leaving) {
                settled.current = true;
                onDone();
            }
        }
    }

    const stop = (event: React.SyntheticEvent) => event.stopPropagation();
    return (
        <Input
            aria-label={`Rename ${artifactPathBasename(target.path)}`}
            autoFocus
            fullWidth
            onBlur={() => void commit(true)}
            onChange={(event) => setName(event.target.value)}
            onClick={stop}
            onDoubleClick={stop}
            onFocus={(event) => selectRenameStem(event.currentTarget, target.kind)}
            onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Enter') {
                    event.preventDefault();
                    void commit(false);
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    settled.current = true;
                    onDone();
                }
            }}
            onKeyUp={stop}
            onPointerDown={stop}
            onPointerUp={stop}
            value={name}
        />
    );
}
