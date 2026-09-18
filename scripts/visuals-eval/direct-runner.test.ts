import { expect, test } from 'bun:test';
import { claudeArgs, readClaudeTurn } from './direct-claude.mjs';
import { parseJsonLines } from './direct-cli.mjs';
import { codexArgs, readCodexTurn } from './direct-codex.mjs';
import { evalInstructions } from './instructions.mjs';

const claudeStream = [
    { subtype: 'init', type: 'system' },
    { message: { content: [{ text: 'Loading the skill.', type: 'text' }] }, type: 'assistant' },
    {
        message: {
            content: [
                {
                    input: { command: 'cat /tmp/skills/haus-visuals/references/design-system.md' },
                    name: 'Bash',
                    type: 'tool_use',
                },
            ],
        },
        type: 'assistant',
    },
    {
        is_error: false,
        result: 'Here is the chart.',
        total_cost_usd: 0.2,
        type: 'result',
        usage: {
            cache_creation_input_tokens: 8905,
            cache_read_input_tokens: 47_183,
            input_tokens: 60,
            output_tokens: 287,
        },
    },
];

const codexStream = [
    { type: 'thread.started' },
    {
        item: {
            aggregated_output: 'the palette lives in design-system.md',
            command: 'cat /tmp/skills/haus-visuals/SKILL.md',
            type: 'command_execution',
        },
        type: 'item.completed',
    },
    { item: { text: 'reasoning', type: 'reasoning' }, type: 'item.completed' },
    {
        type: 'turn.completed',
        usage: {
            cache_write_input_tokens: 0,
            cached_input_tokens: 12_160,
            input_tokens: 15_563,
            output_tokens: 54,
        },
    },
];

const jsonl = (events: unknown[]) => events.map((event) => `${JSON.stringify(event)}\n`).join('');

test('parseJsonLines drops blank and malformed lines instead of throwing', () => {
    expect(parseJsonLines('{"a":1}\n\nnot json\n{"b":2}')).toEqual([{ a: 1 }, { b: 2 }]);
});

test('the claude lane sends the eval instructions as a system prompt append', () => {
    const args = claudeArgs({ modelId: 'claude-fable-5-1', prompt: 'hi', reasoningEffort: 'high' });

    expect(args.slice(0, 2)).toEqual(['-p', 'hi']);
    expect(args[args.indexOf('--append-system-prompt') + 1]).toBe(evalInstructions);
    expect(args[args.indexOf('--model') + 1]).toBe('claude-fable-5-1');
    expect(args[args.indexOf('--effort') + 1]).toBe('high');
    expect(args[args.indexOf('--permission-mode') + 1]).toBe('bypassPermissions');
    expect(args).toContain('--verbose');
    expect(args[args.indexOf('--output-format') + 1]).toBe('stream-json');
});

test('a claude turn folds into the reply, the tool trace and the token usage', () => {
    const turn = readClaudeTurn({ exitCode: 0, stderr: '', stdout: jsonl(claudeStream) });

    expect(turn.text).toBe('Here is the chart.');
    expect(turn.costUsd).toBe(0.2);
    expect(turn.trace).toHaveLength(1);
    expect(turn.trace[0]?.name).toBe('Bash');
    expect(turn.trace[0]?.input).toContain('design-system.md');
    expect(turn.usage).toEqual({
        cacheReadTokens: 47_183,
        cacheWriteTokens: 8905,
        inputTokens: 60,
        outputTokens: 287,
        totalTokens: 347,
    });
});

test('a claude turn that reports is_error fails the prompt rather than passing empty text', () => {
    const stdout = jsonl([{ is_error: true, result: 'Not logged in', type: 'result' }]);

    expect(() => readClaudeTurn({ exitCode: 1, stderr: '', stdout })).toThrow('Not logged in');
});

test('the codex lane passes the reasoning effort as a config override', () => {
    const args = codexArgs({
        lastMessageFile: '/tmp/last.txt',
        modelId: 'gpt-6-astra',
        prompt: 'hi',
        reasoningEffort: 'medium',
    });

    expect(args[0]).toBe('exec');
    expect(args.at(-1)).toBe('hi');
    expect(args[args.indexOf('-c') + 1]).toBe('model_reasoning_effort="medium"');
    expect(args[args.indexOf('--output-last-message') + 1]).toBe('/tmp/last.txt');
    expect(args).toContain('--skip-git-repo-check');
    expect(args).toContain('--json');
});

test('a codex turn takes its text from the last-message file and traces only requests', () => {
    const turn = readCodexTurn({
        exitCode: 0,
        lastMessage: 'Here is the chart.\n',
        stderr: '',
        stdout: jsonl(codexStream),
    });

    expect(turn.text).toBe('Here is the chart.');
    expect(turn.trace).toHaveLength(1);
    expect(turn.trace[0]?.name).toBe('command_execution');
    // The command asked for SKILL.md; only its output mentioned design-system.md,
    // which must not count as having read the design system.
    expect(turn.trace[0]?.input).not.toContain('design-system.md');
    expect(turn.usage?.cacheReadTokens).toBe(12_160);
    expect(turn.usage?.totalTokens).toBe(15_617);
});

test('a failed codex turn reports the failure instead of an empty reply', () => {
    const stdout = jsonl([{ error: { message: 'model not found' }, type: 'turn.failed' }]);

    expect(() => readCodexTurn({ exitCode: 1, lastMessage: '', stderr: '', stdout })).toThrow(
        'model not found'
    );
});
