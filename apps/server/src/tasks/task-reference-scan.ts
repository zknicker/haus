import { parseHausRichReferences, parseTaskKey, parseTaskReferenceTarget } from '@haus/api';
import {
    isInsidePlainUrl,
    isProtectedRange,
    readCodeRanges,
    readMarkdownLinkRanges,
} from '../chats/bare-reference-tokens.ts';

/** One possible Task reference in written text, before the Server resolves it. */
export type TaskReferenceCandidate =
    | { kind: 'id'; start: number; taskId: string; text: string }
    | { boardKey: string; kind: 'key'; number: number; start: number; text: string };

const keyPattern = /[A-Z][A-Z0-9]{1,4}-[1-9][0-9]*/gu;

/**
 * Finds every Task reference candidate in content order (ADR 0051): explicit
 * `task://<taskId>` rich references, and bare keys like `SEC-12` that are
 * word-bounded, case-sensitive, and outside inline code, code fences, Markdown
 * links, and plain URLs. Whether a candidate names a real Task is the
 * resolver's job; unresolved candidates stay plain text.
 */
export function readTaskReferenceCandidates(content: string): TaskReferenceCandidate[] {
    const code = readCodeRanges(content);
    const candidates: TaskReferenceCandidate[] = [];
    for (const reference of parseHausRichReferences(content)) {
        if (reference.kind !== 'task' || isProtectedRange(code, reference.start, reference.end)) {
            continue;
        }
        const taskId = parseTaskReferenceTarget(reference.id);
        if (taskId) {
            candidates.push({
                kind: 'id',
                start: reference.start,
                taskId,
                text: reference.text,
            });
        }
    }

    const shielded = [...code, ...readMarkdownLinkRanges(content)];
    for (const match of content.matchAll(keyPattern)) {
        const text = match[0];
        const start = match.index;
        const end = start + text.length;
        if (
            !(isKeyBoundary(content[start - 1]) && isKeyBoundary(content[end])) ||
            isProtectedRange(shielded, start, end) ||
            isInsidePlainUrl(content, start)
        ) {
            continue;
        }
        const parsed = parseTaskKey(text);
        if (parsed) {
            candidates.push({ ...parsed, kind: 'key', start, text });
        }
    }
    return candidates.sort((left, right) => left.start - right.start);
}

function isKeyBoundary(character: string | undefined) {
    return !(character && /[-A-Za-z0-9_/]/u.test(character));
}
