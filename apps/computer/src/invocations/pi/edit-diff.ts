import { countOccurrences, fuzzyFindText, normalizeForFuzzyMatch } from './fuzzy-match.ts';
import {
    applyReplacements,
    type TextReplacement,
    widenReplacementsToLines,
} from './line-replacements.ts';

export interface Edit {
    newText: string;
    oldText: string;
}

interface MatchedEdit extends TextReplacement {
    editIndex: number;
}

export function splitBom(content: string) {
    return content.startsWith('\uFEFF')
        ? { bom: '\uFEFF', text: content.slice(1) }
        : { bom: '', text: content };
}

export function normalizeToLF(text: string) {
    return text.replace(/\r\n/gu, '\n').replace(/\r/gu, '\n');
}

export function applyEditsToFileText(rawContent: string, edits: Edit[], path: string) {
    const { bom, text: content } = splitBom(rawContent);
    const normalizedContent = normalizeToLF(content);
    const { newContent, replacements } = applyEditsToNormalizedContent(
        normalizedContent,
        edits,
        path
    );
    return (
        bom +
        (content === normalizedContent
            ? newContent
            : applyReplacementsToOriginal(content, replacements))
    );
}

export function applyReplacementsToOriginal(
    originalContent: string,
    replacements: TextReplacement[]
) {
    let crlfBefore = 0;
    let nextCrlf = originalContent.indexOf('\r\n');
    const toOriginal = (offset: number) => {
        while (nextCrlf !== -1 && nextCrlf - crlfBefore < offset) {
            crlfBefore++;
            nextCrlf = originalContent.indexOf('\r\n', nextCrlf + 2);
        }
        return offset + crlfBefore;
    };

    const parts: string[] = [];
    let endsWithCr = false;
    const push = (part: string) => {
        if (part.length === 0) {
            return;
        }
        const seamWouldMergeIntoCrlf = endsWithCr && part[0] === '\n';
        if (seamWouldMergeIntoCrlf) {
            parts.push('\n');
        }
        parts.push(part);
        endsWithCr = part.at(-1) === '\r';
    };
    let position = 0;
    for (const replacement of replacements) {
        const start = toOriginal(replacement.matchIndex);
        push(originalContent.slice(position, start));
        const ending = getLineEndingAt(originalContent, start);
        push(ending === '\n' ? replacement.newText : replacement.newText.replaceAll('\n', ending));
        position = toOriginal(replacement.matchIndex + replacement.matchLength);
    }
    push(originalContent.slice(position));
    return parts.join('');
}

export function applyEditsToNormalizedContent(
    normalizedContent: string,
    edits: Edit[],
    path: string
) {
    const normalizedEdits = edits.map((edit) => ({
        newText: normalizeToLF(edit.newText),
        oldText: normalizeToLF(edit.oldText),
    }));
    for (const [index, edit] of normalizedEdits.entries()) {
        if (edit.oldText.length === 0) {
            throw emptyOldTextError(path, index, normalizedEdits.length);
        }
    }

    const usedFuzzyMatch = normalizedEdits.some(
        (edit) => fuzzyFindText(normalizedContent, edit.oldText).usedFuzzyMatch
    );
    const replacementBaseContent = usedFuzzyMatch
        ? normalizeForFuzzyMatch(normalizedContent)
        : normalizedContent;

    const matchedEdits: MatchedEdit[] = normalizedEdits.map((edit, index) => {
        const match = fuzzyFindText(replacementBaseContent, edit.oldText);
        if (!match.found) {
            throw notFoundError(path, index, normalizedEdits.length);
        }
        const occurrences = countOccurrences(replacementBaseContent, edit.oldText);
        if (occurrences > 1) {
            throw duplicateError(path, index, normalizedEdits.length, occurrences);
        }
        return {
            editIndex: index,
            matchIndex: match.index,
            matchLength: match.matchLength,
            newText: edit.newText,
        };
    });

    matchedEdits.sort((a, b) => a.matchIndex - b.matchIndex);
    for (const [index, current] of matchedEdits.entries()) {
        const previous = matchedEdits[index - 1];
        if (previous && previous.matchIndex + previous.matchLength > current.matchIndex) {
            throw new Error(
                `edits[${previous.editIndex}] and edits[${current.editIndex}] overlap in ${path}. Merge them into one edit or target disjoint regions.`
            );
        }
    }

    const replacements = usedFuzzyMatch
        ? widenReplacementsToLines(normalizedContent, replacementBaseContent, matchedEdits)
        : matchedEdits;
    const newContent = applyReplacements(normalizedContent, replacements);
    if (normalizedContent === newContent) {
        throw noChangeError(path, normalizedEdits.length);
    }
    return { baseContent: normalizedContent, newContent, replacements };
}

function getLineEndingAt(content: string, offset: number) {
    let lineFeed = content.indexOf('\n', offset);
    if (lineFeed === -1) {
        lineFeed = content.lastIndexOf('\n', offset);
    }
    if (lineFeed === -1) {
        return content.includes('\r') ? '\r' : '\n';
    }
    return content[lineFeed - 1] === '\r' ? '\r\n' : '\n';
}

function notFoundError(path: string, editIndex: number, totalEdits: number) {
    if (totalEdits === 1) {
        return new Error(
            `Could not find the exact text in ${path}. The old text must match exactly including all whitespace and newlines.`
        );
    }
    return new Error(
        `Could not find edits[${editIndex}] in ${path}. The oldText must match exactly including all whitespace and newlines.`
    );
}

function duplicateError(path: string, editIndex: number, totalEdits: number, occurrences: number) {
    if (totalEdits === 1) {
        return new Error(
            `Found ${occurrences} occurrences of the text in ${path}. The text must be unique. Please provide more context to make it unique.`
        );
    }
    return new Error(
        `Found ${occurrences} occurrences of edits[${editIndex}] in ${path}. Each oldText must be unique. Please provide more context to make it unique.`
    );
}

function emptyOldTextError(path: string, editIndex: number, totalEdits: number) {
    if (totalEdits === 1) {
        return new Error(`oldText must not be empty in ${path}.`);
    }
    return new Error(`edits[${editIndex}].oldText must not be empty in ${path}.`);
}

function noChangeError(path: string, totalEdits: number) {
    if (totalEdits === 1) {
        return new Error(
            `No changes made to ${path}. The replacement produced identical content. This might indicate an issue with special characters or the text not existing as expected.`
        );
    }
    return new Error(`No changes made to ${path}. The replacements produced identical content.`);
}
