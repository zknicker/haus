import { describe, expect, test } from 'bun:test';
import { codexQuestionRequest } from './question-request.ts';

function question(overrides: Record<string, unknown> = {}) {
    return {
        header: 'Color',
        id: 'color',
        isOther: true,
        isSecret: false,
        options: [{ description: 'Calm default', label: 'Blue' }],
        question: 'Which color?',
        ...overrides,
    };
}

function request(questions: unknown[]) {
    return {
        isBlocking: false,
        itemId: 'call_1',
        questions,
        threadId: 'thread-1',
        turnId: 'turn-1',
    };
}

describe('Codex request_user_input mapping', () => {
    test('maps Codex questions onto single-select Worker questions', () => {
        expect(
            codexQuestionRequest(
                request([
                    question(),
                    question({
                        header: '  ',
                        options: null,
                        question: 'Anything else?',
                    }),
                    question({ options: [{ description: '', label: 'Red' }] }),
                ])
            )
        ).toEqual({
            questions: [
                {
                    header: 'Color',
                    multiSelect: false,
                    options: [{ description: 'Calm default', label: 'Blue' }],
                    question: 'Which color?',
                },
                { header: null, multiSelect: false, options: [], question: 'Anything else?' },
                {
                    header: 'Color',
                    multiSelect: false,
                    options: [{ description: null, label: 'Red' }],
                    question: 'Which color?',
                },
            ],
            turnId: 'turn-1',
            valid: true,
        });
    });

    test('refuses questions Haus cannot show, saying what to fix', () => {
        const tooMany = codexQuestionRequest(request(Array.from({ length: 5 }, () => question())));
        expect(tooMany.valid).toBe(false);
        expect(tooMany.valid ? '' : tooMany.message).toContain('Ask 1 to 4 questions');

        const longHeader = codexQuestionRequest(request([question({ header: 'H'.repeat(61) })]));
        expect(longHeader.valid ? '' : longHeader.message).toContain('0.header');

        expect(codexQuestionRequest({ questions: [] }).valid).toBe(false);
    });
});
