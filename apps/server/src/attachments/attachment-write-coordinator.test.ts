import { afterEach, expect, test } from 'bun:test';
import { makeTestRuntime } from '@haus/effect';
import { Runtime } from 'effect';
import { AttachmentWriteCoordinator } from './attachment-write-coordinator.ts';

const runtimes: ReturnType<typeof makeTestRuntime>[] = [];

afterEach(async () => {
    await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose()));
});

test('quiesces admitted writes before taking exclusive ownership', async () => {
    const coordinator = makeCoordinator();
    const release = coordinator.begin('srv_1234567890abcdef');
    let owned = false;
    const exclusive = coordinator.runExclusive('srv_1234567890abcdef', () => {
        owned = true;
        return Promise.resolve();
    });

    await waitForQuiescence(coordinator);
    expect(owned).toBe(false);
    release();
    await exclusive;
    expect(owned).toBe(true);
});

test('failed exclusive work releases quiescence for later writes', async () => {
    const coordinator = makeCoordinator();
    const closeFailure = new Error('close failed');

    await expect(
        coordinator.runExclusive('srv_1234567890abcdef', () => Promise.reject(closeFailure))
    ).rejects.toBe(closeFailure);

    const release = coordinator.begin('srv_1234567890abcdef');
    release();
});

test('interruption while quiescing restores admission without aborting admitted work', async () => {
    const coordinator = makeCoordinator();
    const releaseFirst = coordinator.begin('srv_1234567890abcdef');
    const abort = new AbortController();
    let owned = false;
    const exclusive = coordinator.runExclusive(
        'srv_1234567890abcdef',
        () => {
            owned = true;
            return Promise.resolve();
        },
        { signal: abort.signal }
    );

    await waitForQuiescence(coordinator);
    abort.abort();
    expect(Runtime.isFiberFailure(await exclusive.catch((cause) => cause))).toBe(true);
    expect(owned).toBe(false);

    const releaseSecond = coordinator.begin('srv_1234567890abcdef');
    releaseSecond();
    releaseFirst();
});

function makeCoordinator() {
    const runtime = makeTestRuntime();
    runtimes.push(runtime);
    return new AttachmentWriteCoordinator(runtime);
}

async function waitForQuiescence(coordinator: AttachmentWriteCoordinator) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
            const release = coordinator.begin('srv_1234567890abcdef');
            release();
        } catch {
            return;
        }
        await Bun.sleep(0);
    }
    throw new Error('Coordinator did not enter quiescence.');
}
