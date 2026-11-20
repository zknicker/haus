import { expectedContextMarker, invalidHunk, unexpectedUpdateLine } from './patch-errors.ts';

const moveToMarker = '*** Move to: ';
const eofMarker = '*** End of File';
const changeContextMarker = '@@ ';
const emptyChangeContextMarker = '@@';

export interface UpdateFileChunk {
    changeContext: string | null;
    contextLineIndices: [number, number][];
    isEndOfFile: boolean;
    newLines: string[];
    oldLines: string[];
}

export interface UpdateHunk {
    chunks: UpdateFileChunk[];
    kind: 'update';
    movePath: string | null;
    path: string;
}

export function readUpdateLine(hunk: UpdateHunk, line: string, lineNumber: number) {
    if (!applyUpdateMarker(hunk, line, lineNumber)) {
        applyChangeLine(hunk.chunks, line, lineNumber);
    }
}

export function isEmptyChunk(chunk: UpdateFileChunk) {
    return chunk.oldLines.length === 0 && chunk.newLines.length === 0;
}

function applyUpdateMarker(hunk: UpdateHunk, line: string, lineNumber: number) {
    const updateLine = line.trimEnd();
    const { chunks } = hunk;
    const last = chunks.at(-1);
    const isContextMarker =
        updateLine === emptyChangeContextMarker || updateLine.startsWith(changeContextMarker);
    if (last?.isEndOfFile) {
        if (updateLine === '') {
            return true;
        }
        if (!isContextMarker) {
            throw expectedContextMarker(line, lineNumber);
        }
    }
    if (chunks.length === 0 && hunk.movePath === null && updateLine.startsWith(moveToMarker)) {
        hunk.movePath = updateLine.slice(moveToMarker.length);
        return true;
    }
    if (isContextMarker && last && isEmptyChunk(last)) {
        throw unexpectedUpdateLine(line, lineNumber);
    }
    if (isContextMarker) {
        chunks.push(
            emptyChunk(
                updateLine === emptyChangeContextMarker
                    ? null
                    : updateLine.slice(changeContextMarker.length)
            )
        );
        return true;
    }
    if (updateLine !== eofMarker) {
        return false;
    }
    if (last && isEmptyChunk(last)) {
        throw invalidHunk('Update hunk does not contain any lines', lineNumber);
    }
    if (last) {
        last.isEndOfFile = true;
    }
    return true;
}

function applyChangeLine(chunks: UpdateFileChunk[], line: string, lineNumber: number) {
    const last = chunks.at(-1);
    if (line === '' || line.startsWith(' ')) {
        const chunk = currentChunk(chunks);
        const text = line.slice(1);
        chunk.contextLineIndices.push([chunk.oldLines.length, chunk.newLines.length]);
        chunk.oldLines.push(text);
        chunk.newLines.push(text);
        return;
    }
    if (line.startsWith('+')) {
        currentChunk(chunks).newLines.push(line.slice(1));
        return;
    }
    if (line.startsWith('-')) {
        currentChunk(chunks).oldLines.push(line.slice(1));
        return;
    }
    if (last && !isEmptyChunk(last)) {
        throw expectedContextMarker(line, lineNumber);
    }
    throw unexpectedUpdateLine(line, lineNumber);
}

function currentChunk(chunks: UpdateFileChunk[]) {
    const last = chunks.at(-1);
    if (last) {
        return last;
    }
    const chunk = emptyChunk(null);
    chunks.push(chunk);
    return chunk;
}

function emptyChunk(changeContext: string | null) {
    const chunk: UpdateFileChunk = {
        changeContext,
        contextLineIndices: [],
        isEndOfFile: false,
        newLines: [],
        oldLines: [],
    };
    return chunk;
}
