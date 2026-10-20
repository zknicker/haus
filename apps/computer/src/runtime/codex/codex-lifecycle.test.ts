import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CodexDriverOptions } from './codex-driver.ts';
import { codexPinFingerprint } from './codex-executable.ts';
import { FakeAppServer } from './testing/fake-app-server.ts';
import { testCodexDriver } from './testing/replay-driver.ts';
import {
    flush,
    startFakeTurn,
    turnCompleted,
    turnStarted,
    usage,
} from './testing/session-harness.ts';

/** Drivers for one Agent HOME, as the executor builds one per turn. */
function agent() {
    const root = mkdtempSync(join(tmpdir(), 'haus-codex-life-'));
    const homeDir = join(root, 'home');
    const hostHomeDir = join(root, 'host');
    const spawned: FakeAppServer[] = [];
    const registered: Array<() => Promise<void>> = [];
    const driver = (overrides: Partial<CodexDriverOptions> = {}) =>
        testCodexDriver(
            () => {
                const fake = new FakeAppServer({}, 'thread-1');
                spawned.push(fake);
                return fake;
            },
            {
                homeDir,
                hostHomeDir,
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

async function completeTurn(fake: FakeAppServer, session: Awaited<ReturnType<typeof open>>) {
    const turn = await startFakeTurn(fake, session as never);
    turnStarted(fake, turn.turnId);
    usage(fake, turn.turnId);
    turnCompleted(fake, turn.turnId);
    await turn.finished;
}

function open(driver: ReturnType<ReturnType<typeof agent>['driver']>, resumeFrom?: object) {
    return driver.openSession({ resumeFrom: resumeFrom as never, sessionId: 'agent-1' });
}

describe('Codex session lifecycle', () => {
    test('detach parks the process warm; the next turn reuses it with the same thread', async () => {
        const life = agent();
        const first = await open(life.driver());
        await completeTurn(life.spawned[0]!, first);
        const state = await first.detach();
        expect(state).toEqual({ runtime: 'codex', threadId: 'thread-1', version: 1 });
        const second = await open(life.driver(), state);
        expect(life.spawned).toHaveLength(1);
        expect(second.isResume).toBe(true);
        expect(second.sessionId).toBe('thread-1');
        await completeTurn(life.spawned[0]!, second);
        await second.destroy();
    });

    test('changed launch facts restart the process and resume the thread there', async () => {
        const life = agent();
        const first = await open(life.driver());
        const state = await first.detach();
        await open(life.driver({ instructions: 'New instructions.' }), state);
        expect(life.spawned).toHaveLength(2);
        expect(await life.spawned[0]!.exited).toMatchObject({ signal: 'SIGTERM' });
        expect(life.spawned[1]!.methods()).toContain('thread/resume');
        expect(life.spawned[1]!.request('thread/resume')?.params).toMatchObject({
            developerInstructions: 'New instructions.',
            threadId: 'thread-1',
        });
    });

    test('a fresh open ends any parked process for the same Agent first', async () => {
        const life = agent();
        await (await open(life.driver())).detach();
        await open(life.driver());
        expect(await life.spawned[0]!.exited).toMatchObject({ signal: 'SIGTERM' });
        expect(life.spawned[1]!.methods()).toContain('thread/start');
    });

    test('stop ends the process and returns the thread to resume', async () => {
        const life = agent();
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
    });

    test('a crashed parked process is never reused', async () => {
        const life = agent();
        const state = await (await open(life.driver())).detach();
        life.spawned[0]!.crash();
        await flush();
        await open(life.driver(), state);
        expect(life.spawned).toHaveLength(2);
    });

    test('detach waits for a cancelled turn to reach the idle boundary', async () => {
        const life = agent();
        const fake = () => life.spawned[0]!;
        const session = await open(life.driver());
        const turn = await startFakeTurn(fake(), session as never);
        turnStarted(fake(), turn.turnId);
        turn.abort.abort();
        let parked = false;
        void session.detach().then(() => {
            parked = true;
        });
        await flush();
        expect(parked).toBe(false);
        turnCompleted(fake(), turn.turnId, 'interrupted');
        await flush();
        expect(parked).toBe(true);
    });

    test('a startup failure ends the process it spawned', async () => {
        const life = agent();
        const failing = testCodexDriver(
            () => {
                const fake = new FakeAppServer({
                    'thread/start': () => ({ error: { message: 'no' } }),
                });
                life.spawned.push(fake);
                return fake;
            },
            { homeDir: join(mkdtempSync(join(tmpdir(), 'haus-codex-life-')), 'home') }
        );
        await expect(open(failing)).rejects.toThrow('no');
        expect(await life.spawned[0]!.exited).toMatchObject({ signal: 'SIGTERM' });
    });

    test('the bootstrap fingerprint is the Codex pin', async () => {
        expect(await agent().driver().bootstrapFingerprint()).toBe(codexPinFingerprint);
    });
});
