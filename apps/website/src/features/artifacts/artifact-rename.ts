import { artifactPathParent, parseArtifactPath } from '@haus/api';

/** What is being renamed: one file (guarded by its head revision) or a whole folder. */
export type ArtifactRenameTarget =
    | { kind: 'file'; path: string; revisionId: string }
    | { kind: 'folder'; path: string };

export type RenameCandidate =
    | { status: 'invalid'; message: string }
    | { status: 'unchanged' }
    | { status: 'ready'; to: string };

/**
 * Where a typed name moves the target: the name changes, the folder it sits in
 * does not. A blank name or the current one is no rename; a name the path
 * rules refuse says why.
 */
export function renameCandidate(target: ArtifactRenameTarget, name: string): RenameCandidate {
    const trimmed = name.trim();
    if (trimmed === '') {
        return { status: 'unchanged' };
    }
    if (trimmed.includes('/')) {
        return { message: 'A name cannot contain "/".', status: 'invalid' };
    }
    const parent = artifactPathParent(target.path);
    const next = parseArtifactPath(parent ? `${parent}/${trimmed}` : trimmed);
    if (!next.ok) {
        return { message: next.message, status: 'invalid' };
    }
    // A case-only rename is still a rename.
    return next.path === target.path ? { status: 'unchanged' } : { status: 'ready', to: next.path };
}

/** The move input for a rename; the head guard only applies to files. */
export function renameMove(target: ArtifactRenameTarget, to: string) {
    return {
        from: target.path,
        to,
        ...(target.kind === 'file' ? { base_revision_id: target.revisionId } : {}),
    };
}

/** Like Finder: a file's name is selected up to its extension, a folder's in full. */
export function selectRenameStem(input: HTMLInputElement, kind: ArtifactRenameTarget['kind']) {
    const dot = input.value.lastIndexOf('.');
    input.setSelectionRange(0, kind === 'file' && dot > 0 ? dot : input.value.length);
}
