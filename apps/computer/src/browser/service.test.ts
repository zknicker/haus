import { expect, test } from 'bun:test';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { BrowserServiceCoordinator } from './service.ts';

test('disconnect waits for an in-progress configuration transition', async () => {
    const runtime = makeDaemonRuntime();
    const coordinator = new BrowserServiceCoordinator(runtime);
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    const events: string[] = [];
    try {
        const first = coordinator.reconcile('/root', async () => {
            events.push('reading');
            await gate;
            events.push('read');
            return { enabled: false, connection: null };
        });
        const disconnected = coordinator.disconnect().then(() => {
            events.push('disconnected');
        });
        release();
        await Promise.all([first, disconnected]);
        expect(events).toEqual(['reading', 'read', 'disconnected']);
        expect(coordinator.get()).toBeNull();
    } finally {
        await runtime.dispose();
    }
});
