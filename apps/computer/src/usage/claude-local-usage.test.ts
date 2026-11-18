import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readClaudeLocalUsage } from './claude-local-usage.ts';

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

test('uses ccusage Claude replay and final-snapshot dedupe semantics', async () => {
    const now = new Date('2026-08-14T12:00:00Z');
    const root = await mkdtemp(join(tmpdir(), 'haus-claude-local-'));
    roots.push(root);
    const file = join(root, 'projects', 'project', 'session.jsonl');
    await mkdir(join(root, 'projects', 'project'), { recursive: true });
    const row = (outputTokens: number, isSidechain: boolean) => ({
        isSidechain,
        message: {
            id: 'message-1',
            model: 'claude-sonnet-4-6',
            usage: {
                cache_creation_input_tokens: 10,
                cache_read_input_tokens: 70,
                input_tokens: 20,
                output_tokens: outputTokens,
            },
        },
        requestId: 'request-1',
        timestamp: now.toISOString(),
    });
    await writeFile(
        file,
        [row(5, true), row(12, false), row(9, false)]
            .map((value) => JSON.stringify(value))
            .join('\n')
    );
    await utimes(file, now, now);

    const snapshot = await readClaudeLocalUsage({ configDirs: [root], now });

    expect(snapshot?.totals).toEqual({
        cacheReadTokens: 70,
        cacheWriteTokens: 10,
        inputTokens: 100,
        outputTokens: 12,
        totalTokens: 112,
    });
    const refreshed = await readClaudeLocalUsage({
        configDirs: [root],
        now: new Date('2026-08-14T12:01:00Z'),
    });
    if (!snapshot) {
        throw new Error('Expected a Claude usage snapshot.');
    }
    expect(refreshed).toEqual({ ...snapshot, capturedAt: '2026-08-14T12:01:00.000Z' });
});
