import { afterEach, beforeEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { editRunner } from '../editor.ts';
import { operationSession } from '../operation-session.test-support.ts';
import { inlinePayloads, type OperationResult } from '../operation.ts';

export function patchWorkspace() {
    const workspace = { dir: '' };
    beforeEach(async () => {
        workspace.dir = await mkdtemp(join(tmpdir(), 'haus-apply-patch-'));
    });
    afterEach(async () => {
        await rm(workspace.dir, { force: true, recursive: true });
    });
    return workspace;
}

export function applyPatchIn(
    dir: string,
    input: string,
    options: { cwd?: string; signal?: AbortSignal } = {}
) {
    return editRunner(
        {
            edit: { command: 'apply_patch', input, ...(options.cwd ? { cwd: options.cwd } : {}) },
            kind: 'edit',
        },
        {
            agentId: 'agent_patch',
            cwd: dir,
            env: { HOME: join(dir, 'home') },
            invocationId: 'invocation_patch',
            logPath: join(dir, 'invocation.log'),
            payloads: inlinePayloads,
            signal: options.signal ?? new AbortController().signal,
            timeoutMs: 30_000,
            ...operationSession(),
        }
    );
}

export function wrapPatch(body: string) {
    return `*** Begin Patch\n${body}\n*** End Patch`;
}

export function text(outcome: OperationResult['outcome'], body: string) {
    return { outcome, output: { kind: 'text' as const, text: body }, truncated: false };
}
