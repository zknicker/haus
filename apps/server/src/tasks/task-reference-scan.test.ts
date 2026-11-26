import { describe, expect, test } from 'bun:test';
import { readTaskReferenceCandidates } from './task-reference-scan.ts';

describe('readTaskReferenceCandidates', () => {
    test('finds task links in content order and leaves bare codes to Issues', () => {
        expect(
            readTaskReferenceCandidates(
                'See [the bug](task://tsk_abc), then SEC-12 and [more](task://tsk_def).'
            )
        ).toEqual([
            { start: 4, taskId: 'tsk_abc', text: '[the bug](task://tsk_abc)' },
            { start: 47, taskId: 'tsk_def', text: '[more](task://tsk_def)' },
        ]);
    });

    test('ignores task links inside inline code and fences', () => {
        expect(readTaskReferenceCandidates('`[x](task://tsk_in_code)`')).toEqual([]);
        expect(readTaskReferenceCandidates('```\n[x](task://tsk_fenced)\n```')).toEqual([]);
    });
});
