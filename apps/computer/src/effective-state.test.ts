import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hausAgentVersion } from '@haus/api';
import { readEffectiveAgentStates } from './effective-state.ts';
import { writeAgentSessionState } from './harness/session-store.ts';

let root: string | null = null;

afterEach(async () => {
    if (root) {
        await rm(root, { force: true, recursive: true });
        root = null;
    }
});

test('effective-state reports are derived from durable per-Agent sessions', async () => {
    root = await mkdtemp(join(tmpdir(), 'haus-effective-state-'));
    const agentsRoot = join(root, 'servers', 'srv_test', 'agents');
    const appliedRoot = join(agentsRoot, 'agt_applied');
    await mkdir(appliedRoot, { recursive: true });
    await writeAgentSessionState(appliedRoot, {
        bootstrapFingerprint: 'bootstrap_current',
        effectiveModel: { modelId: 'gpt-5.6-sol', runtimeId: 'codex' },
        generation: 1,
        hausAgentAppliedAt: '2026-08-28T12:00:00.000Z',
        hausAgentStatus: 'current',
        hausAgentVersion,
        instructionFingerprint: 'instructions_current',
        resumeState: { threadId: 'thread-local' },
        runtimeSessionId: 'session-local',
    });
    await mkdir(join(agentsRoot, 'agt_missing'), { recursive: true });

    expect(await readEffectiveAgentStates(root, 'srv_test')).toEqual([
        {
            agentId: 'agt_applied',
            hausAgentAppliedAt: '2026-08-28T12:00:00.000Z',
            hausAgentStatus: 'current',
            hausAgentVersion,
            missingResources: [],
            modelId: 'gpt-5.6-sol',
            reasoningEffort: null,
            runtimeId: 'codex',
        },
        {
            agentId: 'agt_missing',
            hausAgentAppliedAt: null,
            hausAgentStatus: 'pending',
            hausAgentVersion: null,
            missingResources: ['session'],
            modelId: null,
            reasoningEffort: null,
            runtimeId: null,
        },
    ]);
});
