import { describe, expect, test } from 'bun:test';
import type { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createClaudeCodeThoughtSummarizer, thoughtSummaryModel } from './thought-summarizer.ts';

function fakeClaude() {
    const spawned: { args: string[]; child: FakeChild }[] = [];
    const spawnProcess = ((_command: string, args: string[]) => {
        const child = new FakeChild();
        spawned.push({ args, child });
        return child;
    }) as unknown as typeof spawn;
    return { spawned, spawnProcess };
}

class FakeChild extends EventEmitter {
    readonly stdin = new PassThrough();
    readonly stdout = new PassThrough();
    readonly written: unknown[] = [];
    killed = false;

    constructor() {
        super();
        this.stdin.setEncoding('utf8');
        this.stdin.on('data', (chunk: string) => {
            for (const line of chunk.split('\n').filter(Boolean)) {
                this.written.push(JSON.parse(line));
            }
        });
    }

    answer(result: string) {
        this.stdout.write(`${JSON.stringify({ type: 'assistant' })}\n`);
        this.stdout.write(`${JSON.stringify({ result, subtype: 'success', type: 'result' })}\n`);
    }

    kill() {
        this.killed = true;
        return true;
    }
}

describe('Claude Code thought summarizer', () => {
    test('runs Haiku once, warm, and finishes its answer as a phrase', async () => {
        const claude = fakeClaude();
        const summarizer = createClaudeCodeThoughtSummarizer({
            executable: '/bin/claude',
            spawnProcess: claude.spawnProcess,
        });
        summarizer.warm();
        const pending = summarizer.summarize('The user wants the Halloween bids compared.');
        await Bun.sleep(0);
        const [first] = claude.spawned;
        expect(claude.spawned).toHaveLength(1);
        expect(first?.args).toContain(thoughtSummaryModel);
        expect(first?.args).toContain('--no-session-persistence');
        expect(first?.child.written).toEqual([
            {
                message: {
                    content:
                        '<reasoning>\nThe user wants the Halloween bids compared.\n</reasoning>',
                    role: 'user',
                },
                type: 'user',
            },
        ]);
        first?.child.answer('"Comparing Halloween bids to last week."');
        expect(await pending).toBe('Comparing Halloween bids to last week');
        summarizer.close();
        expect(first?.child.killed).toBe(true);
    });

    test('drops a late answer and refuses new work until it lands', async () => {
        const claude = fakeClaude();
        const summarizer = createClaudeCodeThoughtSummarizer({
            executable: '/bin/claude',
            spawnProcess: claude.spawnProcess,
            timeoutMs: 5,
        });
        expect(await summarizer.summarize('first block of reasoning text')).toBeNull();
        expect(await summarizer.summarize('second block while busy')).toBeNull();
        const child = claude.spawned[0]?.child;
        expect(child?.written).toHaveLength(1);

        child?.answer('Late answer');
        await Bun.sleep(0);
        const next = summarizer.summarize('third block after the late answer');
        await Bun.sleep(0);
        child?.answer('Reading the chart');
        expect(await next).toBe('Reading the chart');
        summarizer.close();
    });

    test('a process that exits resolves the waiting request to null', async () => {
        const claude = fakeClaude();
        const summarizer = createClaudeCodeThoughtSummarizer({
            executable: '/bin/claude',
            spawnProcess: claude.spawnProcess,
        });
        const pending = summarizer.summarize('reasoning that never gets an answer');
        claude.spawned[0]?.child.emit('exit', 1);
        expect(await pending).toBeNull();
        summarizer.close();
    });
});
