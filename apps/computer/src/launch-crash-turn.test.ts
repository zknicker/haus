import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentStartCommand } from './launch.ts';
import { launchCrashTurn, traceLaunchCrash } from './launch-crash-turn.ts';

const command = {
    agentId: 'agt_crash',
    modelId: 'gpt-test',
    runId: 'run_crash',
    runtimeId: 'codex',
} as AgentStartCommand;

test('a launch crash reports kind, code, and fingerprint without raw text', () => {
    const raw = 'EACCES: permission denied, open /Users/secret/.haus/token';
    const frame = launchCrashTurn(command, new Date().toISOString(), new Error(raw));
    expect(frame).toMatchObject({
        failureCode: 'launch-failed',
        failureKind: 'unknown',
        outputProduced: false,
        status: 'failed',
    });
    expect(frame.failureFingerprint).toMatch(/^[0-9a-f]{16}$/u);
    expect(frame.summary).not.toContain('EACCES');
    expect(JSON.stringify(frame)).not.toContain('/Users/secret');
});

test('the raw crash text stays in the local turn trace', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-launch-crash-'));
    try {
        await traceLaunchCrash({ dataRoot, serverId: 'srv_1' }, command, new Error('boom 42'));
        const trace = await readFile(
            join(
                dataRoot,
                'servers',
                'srv_1',
                'agents',
                'agt_crash',
                'runtime',
                'turn-run_crash.log'
            ),
            'utf8'
        );
        expect(trace).toContain('boom 42');
    } finally {
        await rm(dataRoot, { force: true, recursive: true });
    }
});
