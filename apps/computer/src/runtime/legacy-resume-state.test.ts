import { afterAll, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAgentSessionState } from '../harness/session-store.ts';
import { toHausResumeState } from './legacy-resume-state.ts';
import { isRuntimeResumeRejection } from './resume-rejected.ts';
import type { RuntimeResumeState } from './resume-state.ts';

// `resumeState` exactly as the AI SDK harness wrote it into real Agent `session.json` files
// (captured from ~/.haus dev data, ids and secrets replaced). Claude Code keeps the
// conversation under `data.claudeSessionId`; harness-acp keeps the Codex thread (the rollout
// file's id) and the Grok session under `data.acpSessionId`.
const legacyClaude = {
    data: {
        bridge: { lastSeenEventId: 54, port: 64_858, sandboxId: 'agt_c-1', token: 'redacted' },
        claudeSessionId: '121bd880-4c4f-4f58-a981-c35455ab6782',
    },
    harnessId: 'claude-code',
    specificationVersion: 'harness-v1',
    type: 'resume-session',
};
const legacyCodex = {
    data: {
        acpSessionId: '01a12154-c29a-7c53-a099-dedca0d7f8bb',
        authenticationProfile: { digest: 'redacted', providerKind: 'direct' },
        coldSession: { configurationFingerprint: 'redacted', version: 1 },
        implementationIdentity: 'redacted',
        initialGuidanceApplied: true,
        instructionsFingerprint: 'redacted',
        skillsDirectory: '/agents/agt_x/home/.agents/skills',
    },
    harnessId: 'codex',
    specificationVersion: 'harness-v1',
    type: 'resume-session',
};
const legacyGrok = {
    data: { acpSessionId: '01a1-grok-session', implementationIdentity: 'redacted' },
    harnessId: 'grok-build',
    specificationVersion: 'harness-v1',
    type: 'resume-session',
};

const roots: string[] = [];
afterAll(() => Promise.all(roots.map((root) => rm(root, { force: true, recursive: true }))));

/** Writes a real-shaped `session.json` and reads it back the way the executor does. */
async function storedResumeState(runtimeId: string, resumeState: object) {
    const root = await mkdtemp(join(tmpdir(), 'haus-legacy-resume-'));
    roots.push(root);
    await writeFile(
        join(root, 'session.json'),
        JSON.stringify({
            bootstrapFingerprint: 'a56f2834',
            effectiveModel: { modelId: 'model', runtimeId },
            generation: 1,
            hausAgentStatus: 'current',
            hausAgentVersion: '6.1.0',
            instructionFingerprint: '2f7841de',
            resumeState,
            runtimeSessionId: 'agt_x-1',
        })
    );
    const stored = await readAgentSessionState(root);
    if (!stored?.resumeState) {
        throw new Error('The stored session did not parse.');
    }
    return stored.resumeState;
}

test('each runtime converts its stored AI SDK state to its own Haus shape on first open', async () => {
    expect(
        toHausResumeState('claude-code', await storedResumeState('claude-code', legacyClaude))
    ).toEqual({
        claudeSessionId: '121bd880-4c4f-4f58-a981-c35455ab6782',
        runtime: 'claude-code',
        version: 1,
    });
    expect(toHausResumeState('codex', await storedResumeState('codex', legacyCodex))).toEqual({
        runtime: 'codex',
        threadId: '01a12154-c29a-7c53-a099-dedca0d7f8bb',
        version: 1,
    });
    // A turn an older Computer parked mid-Stop carried `continueFrom`; the conversation resumes
    // without the abandoned turn.
    const midStop = { ...legacyCodex, continueFrom: { ...legacyCodex, type: 'continue-turn' } };
    expect(toHausResumeState('codex', await storedResumeState('codex', midStop))).toEqual({
        runtime: 'codex',
        threadId: '01a12154-c29a-7c53-a099-dedca0d7f8bb',
        version: 1,
    });
    expect(
        toHausResumeState('grok-build', await storedResumeState('grok-build', legacyGrok))
    ).toEqual({
        runtime: 'grok-build',
        sessionId: '01a1-grok-session',
        version: 1,
    });
});

test('a Haus shape passes through; another runtime or an empty harness state is rejected', () => {
    const codex = { runtime: 'codex', threadId: 't-1', version: 1 } as const;
    expect(toHausResumeState('codex', codex)).toEqual(codex);
    const rejection = (runtimeId: 'claude-code' | 'codex', state: RuntimeResumeState) => {
        try {
            toHausResumeState(runtimeId, state);
            return null;
        } catch (error) {
            return isRuntimeResumeRejection(error) ? (error as { reason: string }).reason : null;
        }
    };
    expect(rejection('claude-code', codex)).toBe('foreign-state');
    expect(rejection('claude-code', legacyCodex)).toBe('foreign-state');
    expect(rejection('codex', { data: {}, harnessId: 'codex' })).toBe('invalid-state');
});
