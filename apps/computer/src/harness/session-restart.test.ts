import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    clearSessionRestartRequest,
    isSessionRestartRequested,
    requestSessionRestart,
} from './session-restart.ts';

test('keeps a restart request durable until a resumed turn clears it', async () => {
    const agentRoot = await mkdtemp(join(tmpdir(), 'haus-session-restart-'));
    try {
        expect(await isSessionRestartRequested(agentRoot)).toBe(false);
        await requestSessionRestart(agentRoot);
        expect(await isSessionRestartRequested(agentRoot)).toBe(true);
        await clearSessionRestartRequest(agentRoot);
        expect(await isSessionRestartRequested(agentRoot)).toBe(false);
    } finally {
        await rm(agentRoot, { force: true, recursive: true });
    }
});
