import { expect, spyOn, test } from 'bun:test';
import { AttachmentDaemonWork } from './attachment-daemon-work.ts';
import { makeDaemonRuntime } from './daemon-runtime.ts';
import {
    closeRuntimeContext,
    openRuntimeContext,
    requireRuntimeContext,
} from './runtime/runtime-context.ts';
import { handleServerRuntimeSettingsFrame } from './server-runtime-settings-frame.ts';

test('the Server’s runtime settings turn idle compaction on and off for the warm pool', async () => {
    const runtime = makeDaemonRuntime();
    openRuntimeContext(runtime);
    try {
        const setting = spyOn(requireRuntimeContext(runtime).warm, 'setIdleCompaction');
        expect(
            handleServerRuntimeSettingsFrame(
                { idleCompaction: true, type: 'server-runtime-settings' },
                runtime
            )
        ).toBe(true);
        expect(
            handleServerRuntimeSettingsFrame(
                { idleCompaction: false, type: 'server-runtime-settings' },
                runtime
            )
        ).toBe(true);
        expect(setting.mock.calls).toEqual([[true], [false]]);
        // Anything else is some other frame's business.
        expect(handleServerRuntimeSettingsFrame({ type: 'agent-restart' }, runtime)).toBe(false);
        expect(handleServerRuntimeSettingsFrame({ type: 'server-runtime-settings' }, runtime)).toBe(
            false
        );
    } finally {
        await closeRuntimeContext(runtime);
    }
});

test('a lost attachment socket turns idle compaction off until the next attach resends it', async () => {
    const runtime = makeDaemonRuntime();
    openRuntimeContext(runtime);
    const work = new AttachmentDaemonWork(runtime);
    try {
        const setting = spyOn(requireRuntimeContext(runtime).warm, 'setIdleCompaction');
        const detach = work.attachSender({ send: () => true });
        handleServerRuntimeSettingsFrame(
            { idleCompaction: true, type: 'server-runtime-settings' },
            runtime
        );
        detach();
        expect(setting.mock.calls).toEqual([[true], [false]]);
    } finally {
        await work.close();
        await closeRuntimeContext(runtime);
    }
});
