import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RuntimeResumeState } from '../runtime/resume-state.ts';
import { HarnessSessionOwner } from './session-lifecycle.ts';
import {
    readAgentSessionState,
    resolveTurnSession,
    writeAgentSessionState,
} from './session-store.ts';

const roots: string[] = [];
const parked: RuntimeResumeState = { runtime: 'codex', threadId: 'thread-parked', version: 1 };
const stopped: RuntimeResumeState = { runtime: 'codex', threadId: 'thread-stopped', version: 1 };

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function fixture() {
    const root = await mkdtemp(join(tmpdir(), 'haus-session-close-'));
    roots.push(root);
    const state = {
        ...resolveTurnSession(null, { generation: 3, modelId: 'gpt-5.6-sol', runtimeId: 'codex' }),
        runtimeSessionId: 'same-session',
        resumeState: parked,
    };
    await writeAgentSessionState(root, state);
    const owner = new HarnessSessionOwner();
    return { root, state, owner, lease: owner.begin(root) };
}

test('shutdown keeps a parked session as parked, without reopening it, and fences new turns', async () => {
    const { root, state, owner, lease } = await fixture();
    let stops = 0;
    lease.attach({
        detach: async () => parked,
        stop: async () => {
            stops++;
            return stopped;
        },
    });
    expect(await lease.checkpoint()).toEqual(parked);
    lease.finish();
    await Promise.all([owner.close(), owner.close()]);
    expect(stops).toBe(0);
    expect(await readAgentSessionState(root)).toEqual(state);
    expect(() => owner.begin(root)).toThrow('shutting down');
});

test('Agent reset waits for its lease without shutting down other Agents', async () => {
    const { root, owner, lease } = await fixture();
    lease.attach({ detach: async () => parked, stop: async () => stopped });
    await lease.checkpoint();
    lease.finish();
    await owner.stopAgent(root);
    expect(() => owner.begin(join(root, 'another-agent'))).not.toThrow();
    const replacement = owner.begin(root);
    replacement.finish();
});

test('shutdown waits for the turn to settle and persist its stopped state', async () => {
    const { root, state, owner, lease } = await fixture();
    let stops = 0;
    lease.attach({
        detach: async () => {
            throw new Error('must stop');
        },
        stop: async () => {
            stops++;
            return stopped;
        },
    });
    let closed = false;
    const closing = owner.close().then(() => {
        closed = true;
    });
    expect(stops).toBe(0);
    const resumeState = await lease.checkpoint();
    expect(stops).toBe(1);
    expect(closed).toBe(false);
    await writeAgentSessionState(root, { ...state, resumeState });
    lease.finish();
    await closing;
    expect(await readAgentSessionState(root)).toEqual({ ...state, resumeState: stopped });
});

test('shutdown during detach waits for the turn writer and keeps its parked state', async () => {
    const { root, state, owner, lease } = await fixture();
    const detach = Promise.withResolvers<RuntimeResumeState>();
    lease.attach({ detach: () => detach.promise, stop: async () => stopped });
    const checkpoint = lease.checkpoint();
    let closed = false;
    const closing = owner.close().then(() => {
        closed = true;
    });
    detach.resolve(parked);
    await writeAgentSessionState(root, { ...state, resumeState: await checkpoint });
    expect(closed).toBe(false);
    lease.finish();
    await closing;
    expect((await readAgentSessionState(root))?.resumeState).toEqual(parked);
});

test('a session that finishes creating during shutdown is stopped at its first checkpoint', async () => {
    const { owner, lease } = await fixture();
    const closing = owner.close();
    let stops = 0;
    lease.attach({
        detach: async () => parked,
        stop: async () => {
            stops++;
            return stopped;
        },
    });
    expect(await lease.checkpoint()).toEqual(stopped);
    lease.finish();
    await closing;
    expect(stops).toBe(1);
});

test('a failed turn with a destroyed session does not stop its dead handle again', async () => {
    const { owner, lease } = await fixture();
    lease.attach({
        detach: async () => parked,
        stop: async () => {
            throw new Error('destroyed');
        },
    });
    lease.discard();
    lease.finish();
    await owner.close();
});

test('shutdown leaves a session reset between turns as reset', async () => {
    const { root, state, owner, lease } = await fixture();
    lease.attach({ detach: async () => parked, stop: async () => stopped });
    await lease.checkpoint();
    lease.finish();
    const reset = { ...state, generation: 4, resumeState: null, runtimeSessionId: null };
    await writeAgentSessionState(root, reset);
    await owner.close();
    expect(await readAgentSessionState(root)).toEqual(reset);
});
