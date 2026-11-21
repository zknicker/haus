import { describe, expect, test } from 'bun:test';
import type { CodexWorkerDriverOptions } from './codex-worker-driver.ts';
import { FakeAppServer } from './testing/fake-app-server.ts';
import { testCodexDriver } from './testing/replay-driver.ts';
import { flush } from './testing/session-harness.ts';

/** Drivers whose app-servers are fakes, each tied to a process registry. */
function machine() {
    const spawned: FakeAppServer[] = [];
    const registered: Array<() => Promise<void>> = [];
    const driver = (overrides: Partial<CodexWorkerDriverOptions> = {}) =>
        testCodexDriver(
            () => {
                const fake = new FakeAppServer({}, 'thread-1');
                spawned.push(fake);
                return fake;
            },
            {
                processes: {
                    add: (close) => registered.push(close),
                    assertOpen: () => undefined,
                    remove: (close) => registered.splice(registered.indexOf(close), 1),
                },
                ...overrides,
            }
        );
    return { driver, registered, spawned };
}

function open(driver: ReturnType<ReturnType<typeof machine>['driver']>, resumeFrom?: object) {
    return driver.openSession({ resumeFrom: resumeFrom as never, sessionId: 'wrk_1' });
}

describe('Codex session lifecycle', () => {
    test('stop ends the process and returns the thread to resume', async () => {
        const life = machine();
        const session = await open(life.driver());
        expect(life.registered).toHaveLength(1);
        expect(await session.stop()).toEqual({
            runtime: 'codex',
            threadId: 'thread-1',
            version: 1,
        });
        expect(await life.spawned[0]!.exited).toMatchObject({ signal: 'SIGTERM' });
        expect(life.registered).toHaveLength(0);
        await open(life.driver(), { runtime: 'codex', threadId: 'thread-1', version: 1 });
        expect(life.spawned).toHaveLength(2);
        expect(life.spawned[1]!.methods()).toContain('thread/resume');
    });

    test('a startup failure ends the process it spawned', async () => {
        const life = machine();
        const failing = life.driver({
            spawn: () => {
                const fake = new FakeAppServer({
                    'thread/start': () => ({ error: { message: 'no' } }),
                });
                life.spawned.push(fake);
                return fake;
            },
        });
        await expect(open(failing)).rejects.toThrow('no');
        expect(await life.spawned[0]!.exited).toMatchObject({ signal: 'SIGTERM' });
        expect(life.registered).toHaveLength(0);
    });

    test('cancelling a hung handshake ends the process', async () => {
        for (const method of ['initialize', 'config/read', 'thread/start']) {
            const life = machine();
            const driver = life.driver({
                spawn: () => {
                    const fake = new FakeAppServer({ [method]: () => 'hold' });
                    life.spawned.push(fake);
                    return fake;
                },
            });
            const abort = new AbortController();
            const opening = driver.openSession({
                resumeFrom: undefined,
                sessionId: 'wrk_1',
                signal: abort.signal,
            });
            await flush();
            expect(life.spawned[0]!.methods()).toContain(method);
            abort.abort(new Error('startup cancelled'));
            await expect(opening).rejects.toThrow('startup cancelled');
            expect(await life.spawned[0]!.exited).toMatchObject({ signal: 'SIGTERM' });
            expect(life.registered).toHaveLength(0);
        }
    });

    test('a handshake the app-server never answers times out and ends the process', async () => {
        const life = machine();
        const driver = life.driver({
            handshakeTimeoutMs: 20,
            spawn: () => {
                const fake = new FakeAppServer({ 'thread/resume': () => 'hold' });
                life.spawned.push(fake);
                return fake;
            },
        });
        await expect(
            open(driver, { runtime: 'codex', threadId: 'thread-1', version: 1 })
        ).rejects.toThrow('handshake');
        expect(await life.spawned[0]!.exited).toMatchObject({ signal: 'SIGTERM' });
        expect(life.registered).toHaveLength(0);
    });
});
