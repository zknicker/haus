import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessAgentResumeSessionState } from '@ai-sdk/harness/agent';
import { HarnessSessionOwner } from './session-lifecycle.ts';
import {
    readAgentSessionState,
    resolveTurnSession,
    writeAgentSessionState,
} from './session-store.ts';

const roots: string[] = [];
const parked: HarnessAgentResumeSessionState = {
    type: 'resume-session',
    harnessId: 'test',
    specificationVersion: 'harness-v1',
    data: { connection: 'old' },
};
const stopped: HarnessAgentResumeSessionState = { ...parked, data: { conversation: 'same' } };

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function fixture() {
    const root = await mkdtemp(join(tmpdir(), 'haus-session-close-'));
    roots.push(root);
    const state = {
        ...resolveTurnSession(null, { generation: 3, modelId: 'test', runtimeId: 'test' }),
        runtimeSessionId: 'same-session',
        resumeState: parked,
    };
    await writeAgentSessionState(root, state);
    const owner = new HarnessSessionOwner();
    return { root, state, owner, lease: owner.begin(root) };
}

test('shutdown resumes and stops a parked session once, preserving identity and generation', async () => {
    const { root, state, owner, lease } = await fixture();
    let stops = 0;
    let resumes = 0;
    const live = {
        detach: async () => parked,
        stop: async () => {
            stops++;
            return stopped;
        },
    };
    lease.attach(live, async (resumeState) => {
        expect(resumeState).toEqual(parked);
        resumes++;
        return live;
    });
    expect(await lease.checkpoint()).toEqual(parked);
    lease.finish();
    await Promise.all([owner.close(), owner.close()]);
    expect({ stops, resumes }).toEqual({ stops: 1, resumes: 1 });
    expect(await readAgentSessionState(root)).toEqual({ ...state, resumeState: stopped });
    expect(() => owner.begin(root)).toThrow('shutting down');
});

test('shutdown waits for the turn to settle and persist its stopped state', async () => {
    const { root, state, owner, lease } = await fixture();
    let stops = 0;
    const live = {
        detach: async () => {
            throw new Error('must stop');
        },
        stop: async () => {
            stops++;
            return stopped;
        },
    };
    lease.attach(live, async () => live);
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

test('shutdown during detach waits for the turn writer before replacing parked state', async () => {
    const { root, state, owner, lease } = await fixture();
    const detach = Promise.withResolvers<HarnessAgentResumeSessionState>();
    const live = { detach: () => detach.promise, stop: async () => stopped };
    lease.attach(live, async () => live);
    const checkpoint = lease.checkpoint();
    const closing = owner.close();
    detach.resolve(parked);
    await writeAgentSessionState(root, { ...state, resumeState: await checkpoint });
    lease.finish();
    await closing;
    expect((await readAgentSessionState(root))?.resumeState).toEqual(stopped);
});

test('a session that finishes creating during shutdown is stopped at its first checkpoint', async () => {
    const { owner, lease } = await fixture();
    const closing = owner.close();
    let stops = 0;
    const live = {
        detach: async () => parked,
        stop: async () => {
            stops++;
            return stopped;
        },
    };
    lease.attach(live, async () => live);
    expect(await lease.checkpoint()).toEqual(stopped);
    lease.finish();
    await closing;
    expect(stops).toBe(1);
});

test('a failed turn with a destroyed session does not stop its dead handle again', async () => {
    const { owner, lease } = await fixture();
    const live = {
        detach: async () => parked,
        stop: async () => {
            throw new Error('destroyed');
        },
    };
    lease.attach(live, async () => live);
    lease.discard();
    lease.finish();
    await owner.close();
});

test('shutdown does not restore a parked session invalidated by a manual reset', async () => {
    const { root, state, owner, lease } = await fixture();
    const live = { detach: async () => parked, stop: async () => stopped };
    lease.attach(live, async () => {
        throw new Error('old session must not restart');
    });
    await lease.checkpoint();
    lease.finish();
    const reset = { ...state, generation: 4, resumeState: null, runtimeSessionId: null };
    await writeAgentSessionState(root, reset);
    await owner.close();
    expect(await readAgentSessionState(root)).toEqual(reset);
});

test('timed-out shutdown passes cancellation to the SDK and cannot write a late stop result', async () => {
    const { root, owner, lease } = await fixture();
    const controller = new AbortController();
    const reachedStop = Promise.withResolvers<void>();
    const stop = Promise.withResolvers<HarnessAgentResumeSessionState>();
    const live = { detach: async () => parked, stop: () => stop.promise };
    lease.attach(live, async (_state, signal) => {
        expect(signal).toBe(controller.signal);
        reachedStop.resolve();
        return live;
    });
    await lease.checkpoint();
    lease.finish();
    const closing = owner.close(controller.signal).then(
        () => null,
        (error: unknown) => error
    );
    await reachedStop.promise;
    controller.abort();
    stop.resolve(stopped);
    expect(await closing).toBeInstanceOf(AggregateError);
    expect((await readAgentSessionState(root))?.resumeState).toEqual(parked);
});
