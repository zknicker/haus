import {
    firstLineMessage,
    invalidHunk,
    invalidHunkHeader,
    invalidPatch,
    lastLineMessage,
    unexpectedUpdateLine,
} from './patch-errors.ts';
import { isEmptyChunk, readUpdateLine, type UpdateHunk } from './update-hunk.ts';

const beginPatchMarker = '*** Begin Patch';
const endPatchMarker = '*** End Patch';
const addFileMarker = '*** Add File: ';
const deleteFileMarker = '*** Delete File: ';
const updateFileMarker = '*** Update File: ';
const environmentIdMarker = '*** Environment ID:';
const heredocStarts = new Set(['<<EOF', "<<'EOF'", '<<"EOF"']);

export type Hunk =
    | { contents: string; kind: 'add'; path: string }
    | { kind: 'delete'; path: string }
    | UpdateHunk;

type ParserMode =
    | { kind: 'add' | 'delete' | 'ended' | 'not-started' | 'started' }
    | { hunkLineNumber: number; kind: 'update' };

interface ParserState {
    environmentId: string | null;
    hunks: Hunk[];
    lineNumber: number;
    mode: ParserMode;
}

export function parsePatch(patch: string) {
    const lines = patchBody(rustLines(patch.trim()));
    const state: ParserState = {
        environmentId: null,
        hunks: [],
        lineNumber: 0,
        mode: { kind: 'not-started' },
    };
    for (const [index, line] of lines.slice(0, -1).entries()) {
        state.lineNumber = index + 1;
        processLine(state, line.replace(/\r$/u, ''));
    }
    state.lineNumber = lines.length;
    ensureUpdateHunkIsNotEmpty(state, endPatchMarker);
    return { environmentId: state.environmentId, hunks: state.hunks };
}

function patchBody(lines: string[]) {
    const strictError = boundaryError(lines);
    if (!strictError) {
        return lines;
    }
    const [first, last] = [lines[0], lines.at(-1)];
    if (
        lines.length >= 4 &&
        first !== undefined &&
        heredocStarts.has(first) &&
        last?.endsWith('EOF')
    ) {
        const inner = lines.slice(1, -1);
        const innerError = boundaryError(inner);
        if (innerError) {
            throw innerError;
        }
        return inner;
    }
    throw strictError;
}

function boundaryError(lines: string[]) {
    const first = lines[0]?.trim();
    const last = lines.at(-1)?.trim();
    if (first === beginPatchMarker && last === endPatchMarker) {
        return null;
    }
    if (first !== undefined && first !== beginPatchMarker) {
        return invalidPatch(firstLineMessage);
    }
    return invalidPatch(lastLineMessage);
}

function processLine(state: ParserState, line: string) {
    const trimmed = line.trim();
    switch (state.mode.kind) {
        case 'not-started':
            if (trimmed === beginPatchMarker) {
                state.mode = { kind: 'started' };
                return;
            }
            throw invalidPatch(firstLineMessage);
        case 'started':
        case 'delete':
            if (handleHeaderOrEnd(state, trimmed)) {
                return;
            }
            throw invalidHunkHeader(trimmed, state.lineNumber);
        case 'add': {
            if (handleHeaderOrEnd(state, trimmed)) {
                return;
            }
            const hunk = state.hunks.at(-1);
            if (line.startsWith('+') && hunk?.kind === 'add') {
                hunk.contents += `${line.slice(1)}\n`;
                return;
            }
            throw invalidHunkHeader(trimmed, state.lineNumber);
        }
        case 'update': {
            if (handleHeaderOrEnd(state, line.trimEnd())) {
                return;
            }
            const hunk = state.hunks.at(-1);
            if (hunk?.kind !== 'update') {
                throw unexpectedUpdateLine(line, state.lineNumber);
            }
            readUpdateLine(hunk, line, state.lineNumber);
            return;
        }
        case 'ended':
            if (trimmed === '') {
                return;
            }
            throw invalidPatch(lastLineMessage);
    }
}

function handleHeaderOrEnd(state: ParserState, trimmed: string) {
    if (state.mode.kind === 'started' && trimmed.startsWith(environmentIdMarker)) {
        if (state.environmentId !== null) {
            throw invalidPatch('apply_patch environment_id cannot be specified more than once');
        }
        const environmentId = trimmed.slice(environmentIdMarker.length).trim();
        if (environmentId === '') {
            throw invalidPatch('apply_patch environment_id cannot be empty');
        }
        state.environmentId = environmentId;
        return true;
    }
    if (trimmed === endPatchMarker) {
        ensureUpdateHunkIsNotEmpty(state, trimmed);
        state.mode = { kind: 'ended' };
        return true;
    }
    const hunk = headerHunk(trimmed);
    if (!hunk) {
        return false;
    }
    ensureUpdateHunkIsNotEmpty(state, trimmed);
    state.hunks.push(hunk);
    state.mode =
        hunk.kind === 'update'
            ? { hunkLineNumber: state.lineNumber, kind: 'update' }
            : { kind: hunk.kind };
    return true;
}

function headerHunk(trimmed: string) {
    const hunks: [string, (path: string) => Hunk][] = [
        [addFileMarker, (path) => ({ contents: '', kind: 'add', path })],
        [deleteFileMarker, (path) => ({ kind: 'delete', path })],
        [updateFileMarker, (path) => ({ chunks: [], kind: 'update', movePath: null, path })],
    ];
    for (const [marker, hunk] of hunks) {
        if (trimmed.startsWith(marker)) {
            return hunk(trimmed.slice(marker.length));
        }
    }
    return null;
}

function ensureUpdateHunkIsNotEmpty(state: ParserState, line: string) {
    const hunk = state.hunks.at(-1);
    if (hunk?.kind !== 'update') {
        return;
    }
    if (hunk.chunks.length === 0 && state.mode.kind === 'update') {
        throw invalidHunk(
            `Update file hunk for path '${hunk.path}' is empty`,
            state.mode.hunkLineNumber
        );
    }
    const last = hunk.chunks.at(-1);
    if (last && isEmptyChunk(last)) {
        throw line === endPatchMarker
            ? invalidHunk('Update hunk does not contain any lines', state.lineNumber)
            : unexpectedUpdateLine(line, state.lineNumber);
    }
}

function rustLines(text: string) {
    return text === '' ? [] : text.split('\n').map((line) => line.replace(/\r$/u, ''));
}
