import { expect, test } from 'bun:test';
import { createBrowserWorkspaceLifecycle } from './browser-workspace-lifecycle.ts';

function harness() {
    const queued = new Map<number, () => void>();
    let next = 0;
    const calls: string[] = [];
    const lifecycle = createBrowserWorkspaceLifecycle({
        clearTimeout: (handle) => queued.delete(handle as unknown as number),
        setTimeout: (run) => {
            next += 1;
            queued.set(next, run);
            return next as unknown as ReturnType<typeof setTimeout>;
        },
    });
    const flush = () => {
        for (const [handle, run] of [...queued]) {
            queued.delete(handle);
            run();
        }
    };
    const mount = (serverId: string) => lifecycle.mount(serverId, () => calls.push('mount'));
    const unmount = (serverId: string) =>
        lifecycle.unmount(serverId, () => calls.push(`reset:${serverId}`));
    return { calls, flush, mount, unmount };
}

test("StrictMode's double mount for the same Server never resets, so open pages survive", () => {
    const { calls, flush, mount, unmount } = harness();
    mount('s1');
    unmount('s1');
    mount('s1');
    flush();
    expect(calls).toEqual(['mount', 'mount']);
});

test('an unmount with no remount resets after the current task', () => {
    const { calls, flush, mount, unmount } = harness();
    mount('s1');
    unmount('s1');
    expect(calls).toEqual(['mount']);
    flush();
    expect(calls).toEqual(['mount', 'reset:s1']);
});

test('switching Servers resets the old workspace before the new one mounts', () => {
    const { calls, flush, mount, unmount } = harness();
    mount('s1');
    unmount('s1');
    mount('s2');
    flush();
    expect(calls).toEqual(['mount', 'reset:s1', 'mount']);
});
