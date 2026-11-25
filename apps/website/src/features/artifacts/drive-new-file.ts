import { artifactPathKey, parseArtifactPath } from '@haus/api';

export function untitledFileName(taken: Iterable<string>) {
    const names = new Set([...taken].map(artifactPathKey));
    let name = 'untitled.md';
    for (let index = 2; names.has(artifactPathKey(name)); index += 1) {
        name = `untitled-${index}.md`;
    }
    return name;
}

export type NewFolderCandidate =
    | { status: 'empty' }
    | { message: string; status: 'invalid' }
    | { path: string; status: 'ready' };

export function newFolderCandidate(parent: string, name: string, taken: Iterable<string>) {
    const trimmed = name.trim();
    if (trimmed === '') {
        const empty: NewFolderCandidate = { status: 'empty' };
        return empty;
    }
    if (trimmed.includes('/')) {
        return invalid('A name cannot contain "/".');
    }
    const parsed = parseArtifactPath(parent ? `${parent}/${trimmed}` : trimmed);
    if (!parsed.ok) {
        return invalid(parsed.message);
    }
    const key = artifactPathKey(trimmed);
    if ([...taken].some((existing) => artifactPathKey(existing) === key)) {
        return invalid(`“${trimmed}” already exists here.`);
    }
    const ready: NewFolderCandidate = { path: parsed.path, status: 'ready' };
    return ready;
}

function invalid(message: string) {
    const candidate: NewFolderCandidate = { message, status: 'invalid' };
    return candidate;
}
