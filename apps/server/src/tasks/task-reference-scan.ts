import { parseHausRichReferences, parseTaskReferenceTarget } from '@haus/api';
import { isProtectedRange, readCodeRanges } from '../chats/bare-reference-tokens.ts';

/** One possible Task reference in written text, before the Server resolves it. */
export interface TaskReferenceCandidate {
    start: number;
    taskId: string;
    text: string;
}

/**
 * Finds every explicit `task://<taskId>` rich reference in content order,
 * outside inline code and code fences. A bare code like `GEN-12` names an
 * Issue, never a Task (ADR 0062). Whether a candidate names a real Task is the
 * resolver's job; unresolved candidates stay plain text.
 */
export function readTaskReferenceCandidates(content: string): TaskReferenceCandidate[] {
    const code = readCodeRanges(content);
    return parseHausRichReferences(content).flatMap((reference) => {
        if (reference.kind !== 'task' || isProtectedRange(code, reference.start, reference.end)) {
            return [];
        }
        const taskId = parseTaskReferenceTarget(reference.id);
        return taskId ? [{ start: reference.start, taskId, text: reference.text }] : [];
    });
}
