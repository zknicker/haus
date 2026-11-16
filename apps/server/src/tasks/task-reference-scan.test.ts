import { describe, expect, test } from 'bun:test';
import { readTaskReferenceCandidates } from './task-reference-scan.ts';

const keys = (content: string) =>
    readTaskReferenceCandidates(content).map((candidate) => candidate.text);

describe('readTaskReferenceCandidates', () => {
    test('finds bare keys and task links in content order', () => {
        expect(
            readTaskReferenceCandidates('See [the bug](task://tsk_abc), then SEC-12 and GEN-3.')
        ).toEqual([
            { kind: 'id', start: 4, taskId: 'tsk_abc', text: '[the bug](task://tsk_abc)' },
            { boardKey: 'SEC', kind: 'key', number: 12, start: 36, text: 'SEC-12' },
            { boardKey: 'GEN', kind: 'key', number: 3, start: 47, text: 'GEN-3' },
        ]);
    });

    test('keeps bare keys word-bounded and case-sensitive', () => {
        expect(keys('(SEC-12), SEC-12. SEC-12:')).toEqual(['SEC-12', 'SEC-12', 'SEC-12']);
        expect(keys('sec-12 Sec-12 xSEC-12 SEC-12x SEC-12-3 SEC_12 SEC-0 S-1')).toEqual([]);
        expect(keys('ABCDEF-1 is too long a key')).toEqual([]);
    });

    test('ignores inline code, fences, links, and URLs', () => {
        expect(keys('`SEC-1` and ``SEC-2 here``')).toEqual([]);
        expect(keys('```\nSEC-3\n```\nSEC-4')).toEqual(['SEC-4']);
        expect(keys('`[x](task://tsk_in_code)`')).toEqual([]);
        expect(keys('[see SEC-5](https://example.com) https://x.dev/SEC-6')).toEqual([]);
    });
});
