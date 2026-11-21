import { describe, expect, test } from 'bun:test';
import { TRPCClientError } from '@trpc/client';
import { normalizeProjectKey, projectKeyIssue, projectKeyRefusal } from './project-key.ts';

const refused = (code: string, message: string) =>
    TRPCClientError.from({
        error: { code: -32_009, data: { code: 'CONFLICT', project: { code } }, message },
    });

describe('Project key field', () => {
    test('typed keys read as capitals', () => {
        expect(normalizeProjectKey(' sec2 ')).toBe('SEC2');
    });

    test('a key is 2 to 5 capitals or digits starting with a letter', () => {
        expect(projectKeyIssue('')).toBeNull();
        expect(projectKeyIssue('OPS')).toBeNull();
        expect(projectKeyIssue('O')).toBe(
            'A key is 2 to 5 capital letters or digits, starting with a letter, like SEC.'
        );
        expect(projectKeyIssue('2OPS')).not.toBeNull();
        expect(projectKeyIssue('TOOLONG')).not.toBeNull();
    });

    test('only key refusals land on the key field', () => {
        expect(projectKeyRefusal(refused('TASK_KEY_TAKEN', 'OPS is taken.'))).toBe('OPS is taken.');
        expect(projectKeyRefusal(refused('PROJECT_KEY_FIXED', 'Fixed.'))).toBe('Fixed.');
        expect(projectKeyRefusal(refused('PROJECT_NAME_FIXED', 'Always #haus.'))).toBeNull();
        expect(projectKeyRefusal(new Error('offline'))).toBeNull();
    });
});
