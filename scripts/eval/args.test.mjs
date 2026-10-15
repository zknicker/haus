import { expect, test } from 'bun:test';
import { parseEvalArgs, UsageError } from './args.mjs';

test('defaults to three passes and leaves lanes to the eval', () => {
    expect(parseEvalArgs(['placement'])).toEqual({
        baseline: null,
        lanes: null,
        list: false,
        model: null,
        name: 'placement',
        notes: null,
        passes: 3,
    });
});

test('parses every option', () => {
    const parsed = parseEvalArgs([
        'placement',
        '--baseline',
        'origin/main~2',
        '--passes',
        '5',
        '--lanes',
        '2',
        '--model',
        'claude-code/claude-opus-4/thinking',
        '--notes',
        'notes.md',
    ]);
    expect(parsed).toMatchObject({
        baseline: 'origin/main~2',
        lanes: 2,
        notes: 'notes.md',
        passes: 5,
    });
    expect(parsed.model).toEqual({
        label: 'claude-code/claude-opus-4/thinking',
        modelId: 'claude-opus-4/thinking',
        runtimeId: 'claude-code',
    });
});

test('--list needs no eval name', () => {
    expect(parseEvalArgs(['--list']).list).toBe(true);
});

test.each([
    [[], /Name an eval/u],
    [['placement', 'attention'], /One eval at a time/u],
    [['placement', '--passes', '0'], /whole number/u],
    [['placement', '--passes', 'two'], /whole number/u],
    [['placement', '--lanes'], /needs a value/u],
    [['placement', '--model', 'codex'], /<runtime>\/<model>/u],
    [['placement', '--baseline', 'a b;rm'], /unusable value/u],
    [['placement', '--gate'], /Unknown option --gate/u],
])('rejects %p', (argv, message) => {
    expect(() => parseEvalArgs(argv)).toThrow(UsageError);
    expect(() => parseEvalArgs(argv)).toThrow(message);
});
