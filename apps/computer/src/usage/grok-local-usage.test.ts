import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readGrokLocalUsage } from './grok-local-usage.ts';

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

test('uses ccusage Grok turn completion, cache, and dedupe semantics', async () => {
    const now = new Date('2026-08-14T12:00:00Z');
    const root = await mkdtemp(join(tmpdir(), 'haus-grok-local-'));
    roots.push(root);
    const first = join(root, 'sessions', 'project', 'session-1', 'updates.jsonl');
    const second = join(root, 'sessions', 'project', 'session-2', 'updates.jsonl');
    await mkdir(join(root, 'sessions', 'project', 'session-1'), { recursive: true });
    await mkdir(join(root, 'sessions', 'project', 'session-2'), { recursive: true });
    const completed = JSON.stringify({
        timestamp: now.getTime() / 1000,
        params: {
            _meta: { eventId: 'event-1' },
            sessionId: 'session-1',
            update: {
                sessionUpdate: 'turn_completed',
                usage: {
                    modelUsage: {
                        'grok-4.6-build': {
                            cacheCreationTokens: 25,
                            cachedReadTokens: 40,
                            inputTokens: 100,
                            outputTokens: 20,
                            reasoningTokens: 10,
                        },
                    },
                },
            },
        },
    });
    await writeFile(
        first,
        `${completed}\n${JSON.stringify({ params: { update: { sessionUpdate: 'turn_started' } } })}\n`
    );
    await writeFile(second, `${completed}\n`);
    await Promise.all([utimes(first, now, now), utimes(second, now, now)]);

    const snapshot = await readGrokLocalUsage({ grokHome: root, now });

    expect(snapshot?.totals).toEqual({
        cacheReadTokens: 40,
        cacheWriteTokens: 25,
        inputTokens: 100,
        outputTokens: 20,
        totalTokens: 120,
    });
    expect(snapshot?.models).toHaveLength(1);
});
