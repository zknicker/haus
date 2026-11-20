import { afterAll, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    type AgentSessionRecord,
    readAgentSession,
    resolveTurnSession,
    writeAgentSession,
} from './session-file.ts';

const root = await mkdtemp(join(tmpdir(), 'haus-runner-session-'));
afterAll(() => rm(root, { force: true, recursive: true }));

const stored: AgentSessionRecord = {
    bootstrapFingerprint: 'boot-1',
    deliveredInstructionFingerprint: 'stable-1',
    deliveredMemoryDigest: 'memory-1',
    deliveredRuleDigests: { 'haus/AGENTS.md': 'rules-1' },
    generation: 3,
    harness: 'claude-agent-sdk',
    interruptedTurn: false,
    launchedInstructionFingerprint: 'stable-1',
    modelId: 'claude-sonnet-5',
    nativeSessionId: '6b0b7f1e-5f0e-4a43-9f0d-3d7c9b2c1a11',
};

const fresh = {
    bootstrapFingerprint: null,
    deliveredInstructionFingerprint: null,
    deliveredMemoryDigest: null,
    deliveredRuleDigests: {},
    harness: 'claude-agent-sdk',
    interruptedTurn: false,
    launchedInstructionFingerprint: null,
    nativeSessionId: null,
} as const;

test('session.json round-trips through an atomic write', async () => {
    const agentDir = join(root, 'agents', 'agent-1');
    await writeAgentSession(agentDir, stored);
    expect(JSON.parse(await readFile(join(agentDir, 'session.json'), 'utf8'))).toEqual(stored);
    expect(await readAgentSession(agentDir)).toEqual(stored);
});

test('a missing or unreadable session.json reads as no session', async () => {
    expect(await readAgentSession(join(root, 'agents', 'nobody'))).toBeNull();
    const agentDir = join(root, 'agents', 'agent-2');
    await writeAgentSession(agentDir, stored);
    await writeFile(join(agentDir, 'session.json'), '{"generation":"two"}');
    expect(await readAgentSession(agentDir)).toBeNull();
});

test('the same generation and model resumes the stored session', () => {
    expect(
        resolveTurnSession(stored, {
            generation: 3,
            harness: 'claude-agent-sdk',
            modelId: 'claude-sonnet-5',
        })
    ).toEqual(stored);
});

test('a new generation, a model change, or no record starts fresh with nothing to resume', () => {
    expect(
        resolveTurnSession(stored, {
            generation: 4,
            harness: 'claude-agent-sdk',
            modelId: 'claude-sonnet-5',
        })
    ).toEqual({ ...fresh, generation: 4, modelId: 'claude-sonnet-5' });
    expect(
        resolveTurnSession(stored, {
            generation: 3,
            harness: 'claude-agent-sdk',
            modelId: 'claude-opus-5',
        })
    ).toEqual({ ...fresh, generation: 3, modelId: 'claude-opus-5' });
    expect(
        resolveTurnSession(null, {
            generation: 1,
            harness: 'claude-agent-sdk',
            modelId: 'claude-haiku-4-5',
        })
    ).toEqual({ ...fresh, generation: 1, modelId: 'claude-haiku-4-5' });
});

test('a model change that crosses to Pi Durable is the same reset, and the Pi record round-trips', async () => {
    const crossed = resolveTurnSession(stored, {
        generation: 3,
        harness: 'pi-durable',
        modelId: 'gpt-5.6-sol',
    });
    const agentDir = join(root, 'agents', 'agent-3');
    await writeAgentSession(agentDir, { ...crossed, nativeSessionId: 'pi-session-1' });

    expect(crossed).toEqual({
        ...fresh,
        generation: 3,
        harness: 'pi-durable',
        modelId: 'gpt-5.6-sol',
    });
    expect(await readAgentSession(agentDir)).toEqual({
        ...crossed,
        nativeSessionId: 'pi-session-1',
    });
});
