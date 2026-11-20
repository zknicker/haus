import { seekSequence } from './seek-sequence.ts';
import { applyReplacements, parseSourceFile, type Replacement } from './text-file.ts';
import type { UpdateFileChunk } from './update-hunk.ts';

export function updatedContents(
    original: string,
    path: string,
    chunks: readonly UpdateFileChunk[]
) {
    const file = parseSourceFile(original);
    const replacements = computeReplacements(
        file.lines.map((line) => line.text),
        path,
        chunks
    );
    if (replacements.refusal !== undefined) {
        return { refusal: replacements.refusal };
    }
    return { content: applyReplacements(file, replacements.replacements) };
}

function computeReplacements(
    originalLines: readonly string[],
    path: string,
    chunks: readonly UpdateFileChunk[]
) {
    const replacements: Replacement[] = [];
    let lineIndex = 0;
    for (const chunk of chunks) {
        if (chunk.changeContext !== null) {
            const index = seekSequence(originalLines, [chunk.changeContext], lineIndex, false);
            if (index === null) {
                return { refusal: `Failed to find context '${chunk.changeContext}' in ${path}` };
            }
            lineIndex = index + 1;
        }
        if (chunk.oldLines.length === 0) {
            replacements.push({
                newLines: chunk.newLines,
                oldLength: 0,
                start: originalLines.length,
            });
            continue;
        }
        let pattern = chunk.oldLines;
        let newSlice = chunk.newLines;
        let found = seekSequence(originalLines, pattern, lineIndex, chunk.isEndOfFile);
        if (found === null && pattern.at(-1) === '') {
            pattern = pattern.slice(0, -1);
            if (newSlice.at(-1) === '') {
                newSlice = newSlice.slice(0, -1);
            }
            found = seekSequence(originalLines, pattern, lineIndex, chunk.isEndOfFile);
        }
        if (found === null) {
            return {
                refusal: `Failed to find expected lines in ${path}:\n${chunk.oldLines.join('\n')}`,
            };
        }
        replacements.push(...contextPreservingReplacements(chunk, found, pattern, newSlice));
        lineIndex = found + pattern.length;
    }
    replacements.sort((left, right) => left.start - right.start);
    return { replacements };
}

function contextPreservingReplacements(
    chunk: UpdateFileChunk,
    found: number,
    pattern: readonly string[],
    newSlice: readonly string[]
) {
    const replacements: Replacement[] = [];
    let oldStart = 0;
    let newStart = 0;
    for (const [oldContext, newContext] of chunk.contextLineIndices) {
        if (oldContext >= pattern.length || newContext >= newSlice.length) {
            break;
        }
        if (oldStart !== oldContext || newStart !== newContext) {
            replacements.push({
                newLines: newSlice.slice(newStart, newContext),
                oldLength: oldContext - oldStart,
                start: found + oldStart,
            });
        }
        oldStart = oldContext + 1;
        newStart = newContext + 1;
    }
    if (oldStart !== pattern.length || newStart !== newSlice.length) {
        replacements.push({
            newLines: newSlice.slice(newStart),
            oldLength: pattern.length - oldStart,
            start: found + oldStart,
        });
    }
    return replacements;
}
