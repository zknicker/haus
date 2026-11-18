import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    applyAuthoritativeSession,
    readAppliedSessionGeneration,
} from './agent-session-authority.ts';

test('applies each Server session generation once and ignores stale commands', async () => {
    const agentRoot = await mkdtemp(join(tmpdir(), 'haus-session-authority-'));
    let resets = 0;
    const reset = async () => {
        resets += 1;
    };
    try {
        expect(await applyAuthoritativeSession({ agentRoot, generation: 1, reset })).toBe(
            'applied'
        );
        expect(resets).toBe(0);

        expect(await applyAuthoritativeSession({ agentRoot, generation: 2, reset })).toBe(
            'applied'
        );
        expect(await readAppliedSessionGeneration(agentRoot)).toBe(2);
        expect(resets).toBe(1);

        expect(await applyAuthoritativeSession({ agentRoot, generation: 2, reset })).toBe(
            'current'
        );
        expect(await applyAuthoritativeSession({ agentRoot, generation: 1, reset })).toBe('stale');
        expect(resets).toBe(1);
    } finally {
        await rm(agentRoot, { force: true, recursive: true });
    }
});

test('does not advance the applied marker when local reset fails', async () => {
    const agentRoot = await mkdtemp(join(tmpdir(), 'haus-session-authority-failure-'));
    try {
        await expect(
            applyAuthoritativeSession({
                agentRoot,
                generation: 2,
                reset: async () => {
                    throw new Error('reset failed');
                },
            })
        ).rejects.toThrow('reset failed');
        expect(await readAppliedSessionGeneration(agentRoot)).toBeNull();
    } finally {
        await rm(agentRoot, { force: true, recursive: true });
    }
});
